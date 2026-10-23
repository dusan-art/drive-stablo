/**
 * Drive stablo – Google Drive folders and files as an expandable tree.
 * Sections: My Drive, Shared with me, Shared drives, Starred.
 * Optional: add ?folder=FOLDER_ID to the URL to start from a specific folder.
 *
 * Requires the advanced service: Services (+) → Drive API (v3), Identifier: Drive.
 */

const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents,folderColorRgb,properties,starred,' +
               'owners(displayName,emailAddress),shortcutDetails(targetId,targetMimeType))';
const CHUNK = 30; // how many folders are read in one request

function doGet(e) {
  const param = (e && e.parameter && e.parameter.folder) || '';
  const rootId = /^[-\w]+$/.test(param) ? param : '';
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.rootId = rootId;
  return tpl.evaluate()
    .setTitle('Drive stablo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Contents of several folders at once. Returns { folderId: {folders, files} }.
 * '__root' means My Drive.
 */
function getChildrenMany(ids) {
  const rootId = ids.indexOf('__root') >= 0 ? myRootId_() : null;
  const real = ids.map(id => (id === '__root' ? rootId : id));
  const buckets = {};
  real.forEach(id => { buckets[id] = buckets[id] || { folders: [], files: [] }; });

  for (let i = 0; i < real.length; i += CHUNK) {
    const chunk = real.slice(i, i + CHUNK);
    const q = '(' + chunk.map(id => "'" + id + "' in parents").join(' or ') + ') and trashed = false';
    list_(q).forEach(f => (f.parents || []).forEach(p => {
      if (buckets[p]) classify_(f, buckets[p], false);
    }));
  }

  const out = {};
  ids.forEach((id, k) => { out[id] = sorted_(buckets[real[k]]); });
  return out;
}

/** Special sections: '__shared' (Shared with me), '__drives' (Shared drives), '__starred' (Starred). */
function getSpecial(id) {
  if (id === '__shared') return sharedWithMe_();
  if (id === '__drives') return sharedDrives_();
  if (id === '__starred') return starred_();
  throw new Error('Unknown section: ' + id);
}

/** Starred items (with their G: drive path, for opening in Word…). */
function starred_() {
  const data = { folders: [], files: [] };
  list_('starred = true and trashed = false').forEach(f => classify_(f, data, false));
  const items = data.folders.concat(data.files);
  if (items.length) {
    const p = getLocalPaths(items.map(x => x.id));
    items.forEach(x => { x.lpath = p[x.id] === undefined ? null : p[x.id]; });
  }
  return sorted_(data);
}

/** Adds or removes a star (the same star as in Google Drive). */
function setStarred(id, on) {
  Drive.Files.update({ starred: !!on }, id, null, { supportsAllDrives: true, fields: 'id' });
  return !!on;
}

/** Folder name (for the title when ?folder=ID is used). */
function getFolderName(id) {
  return Drive.Files.get(id, { fields: 'name', supportsAllDrives: true }).name;
}

/**
 * Search all of Drive (name + content), like the search box in Google Drive.
 * Google's order (by relevance); at most ~300 results.
 */
function searchDrive(text) {
  text = String(text || '').trim();
  const data = { folders: [], files: [] };
  if (!text) return data;
  const esc = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = "(name contains '" + esc + "' or fullText contains '" + esc + "') and trashed = false";
  let pageToken, n = 0;
  do {
    const r = Drive.Files.list({
      q: q,
      fields: FIELDS,
      pageSize: 100,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives'
    });
    (r.files || []).forEach(f => classify_(f, data, true));
    n += (r.files || []).length;
    pageToken = r.nextPageToken;
  } while (pageToken && n < 300);
  if (pageToken) data.notice = 'Showing the first ' + n + ' results – narrow your search for more precise results.';
  return data;
}

/** Creates a new Google Doc in the given folder ('__root' or empty = My Drive). */
function createDoc(name, folderId) {
  name = String(name || '').trim() || 'New document';
  const parent = (!folderId || folderId === '__root') ? 'root' : folderId;
  const meta = { name: name, mimeType: 'application/vnd.google-apps.document', parents: [parent] };
  const opts = { supportsAllDrives: true, fields: 'id,name,mimeType,size,modifiedTime,webViewLink,parents' };
  let f;
  try {
    f = Drive.Files.create(meta, null, opts);
  } catch (e) {
    f = Drive.Files.create(meta); // fallback if the service does not accept empty content
  }
  if (!f.webViewLink) f.webViewLink = 'https://docs.google.com/document/d/' + f.id + '/edit';
  if (!f.modifiedTime) f.modifiedTime = new Date().toISOString();
  if (!f.mimeType) f.mimeType = 'application/vnd.google-apps.document';
  const bucket = { folders: [], files: [] };
  classify_(f, bucket, false);
  return bucket.files[0];
}

/** Saves the chosen folder icon (emoji) as a Drive file property; empty = default. */
function setFolderEmoji(id, emoji) {
  emoji = String(emoji || '').trim();
  if (emoji.length > 16) throw new Error('The icon is too long – choose a single emoji.');
  Drive.Files.update({ properties: { dsIcon: emoji || null } }, id, null, { supportsAllDrives: true, fields: 'id' });
  return emoji;
}

/** Changes the folder color in Google Drive (Google picks the nearest color from its palette). */
function setFolderColor(id, color) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) throw new Error('Invalid color: ' + color);
  const res = { folderColorRgb: color };
  let f;
  try {
    f = Drive.Files.update(res, id, null, { supportsAllDrives: true, fields: 'folderColorRgb' });
  } catch (e) {
    f = Drive.Files.update(res, id); // fallback
  }
  return (f && f.folderColorRgb) || color;
}

/**
 * File/folder paths as Drive for desktop sees them (e.g. "My Drive/Clients/Offer.docx").
 * null = not on the disk (e.g. "Shared with me" without a shortcut).
 */
function getLocalPaths(ids) {
  const root = myRootId_();
  const memo = {}, driveNames = {};
  const info = id => memo[id] || (memo[id] = Drive.Files.get(id, { fields: 'id,name,parents,driveId', supportsAllDrives: true }));
  const driveName = id => driveNames[id] || (driveNames[id] = Drive.Drives.get(id).name);
  function pathOf(id, depth) {
    if (id === root) return 'My Drive';
    if (depth > 60) return null;
    const f = info(id);
    if (f.driveId && f.id === f.driveId) return 'Shared drives/' + driveName(f.driveId);
    const parent = f.parents && f.parents[0];
    if (!parent) return null;
    if (f.driveId && parent === f.driveId) return 'Shared drives/' + driveName(f.driveId) + '/' + f.name;
    const pp = pathOf(parent, depth + 1);
    return pp === null ? null : pp + '/' + f.name;
  }
  const out = {};
  ids.slice(0, 300).forEach(id => {
    try { out[id] = pathOf(id, 0); } catch (e) { out[id] = null; }
  });
  return out;
}

/**
 * Moves a file or folder to another folder ('__root' = My Drive).
 * Returns { fromKey } – the key of the old parent, for "Undo".
 */
function moveItem(id, toKey) {
  const root = myRootId_();
  const target = (!toKey || toKey === '__root') ? root : toKey;
  const f = Drive.Files.get(id, { fields: 'parents', supportsAllDrives: true });
  const parents = f.parents || [];
  const key = p => (p === root ? '__root' : p);
  if (parents.indexOf(target) >= 0) return { fromKey: key(target), same: true };
  const opts = { addParents: target, supportsAllDrives: true, fields: 'id,parents' };
  if (parents.length) opts.removeParents = parents.join(',');
  Drive.Files.update({}, id, null, opts);
  return { fromKey: parents.length ? key(parents[0]) : null };
}

const ITEM_FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink,parents,folderColorRgb,properties,starred,' +
                    'owners(displayName,emailAddress),shortcutDetails(targetId,targetMimeType)';

/**
 * Access token for uploading files directly from the browser to Google Drive.
 * Works only when the page is opened by the script owner (the token never goes to anyone else).
 */
function getUploadToken() {
  const active = Session.getActiveUser().getEmail();
  if (!active || active !== Session.getEffectiveUser().getEmail()) {
    throw new Error('Uploading is only allowed for the owner of this app.');
  }
  return { token: ScriptApp.getOAuthToken(), root: myRootId_() };
}

/** ID of the My Drive root – lets tabs tell whether they use the same account. */
function getRootId() {
  return myRootId_();
}

/** Creates a new folder in the given folder ('__root' or empty = My Drive). */
function createFolder(name, folderId) {
  name = String(name || '').trim() || 'New folder';
  const parent = (!folderId || folderId === '__root') ? 'root' : folderId;
  const nf = createIn_({ name: name, mimeType: FOLDER, parents: [parent] });
  const f = Drive.Files.get(nf.id, { fields: ITEM_FIELDS, supportsAllDrives: true });
  const bucket = { folders: [], files: [] };
  classify_(f, bucket, false);
  return bucket.folders[0];
}

/** Renames a file or folder. */
function renameItem(id, name) {
  name = String(name || '').trim();
  if (!name) throw new Error('The name cannot be empty.');
  const f = Drive.Files.update({ name: name }, id, null, { supportsAllDrives: true, fields: 'id,name' });
  return (f && f.name) || name;
}

/** Moves to Trash (or restores from Trash when restore = true). Nothing is deleted permanently. */
function trashItem(id, restore) {
  Drive.Files.update({ trashed: !restore }, id, null, { supportsAllDrives: true, fields: 'id' });
  return true;
}

/** Copies a file or a whole folder (with subfolders) to the given folder ('__root' = My Drive). */
function copyItem(id, toKey) {
  const root = myRootId_();
  const target = (!toKey || toKey === '__root') ? root : toKey;
  const src = Drive.Files.get(id, { fields: 'id,name,mimeType,parents', supportsAllDrives: true });
  const isFolder = src.mimeType === FOLDER;
  if (isFolder && isInside_(target, src.id, root)) throw new Error('A folder can\'t be copied into itself or its own subfolder.');
  const name = (src.parents || []).indexOf(target) >= 0 ? 'Copy of ' + src.name : src.name;
  const ctx = { deadline: Date.now() + 4.5 * 60 * 1000, n: 0 };
  const newId = isFolder ? copyFolder_(src.id, name, target, ctx) : copyFile_(src, name, target);
  const f = Drive.Files.get(newId, { fields: ITEM_FIELDS, supportsAllDrives: true });
  const bucket = { folders: [], files: [] };
  classify_(f, bucket, false);
  return { item: bucket.folders[0] || bucket.files[0], isFolder: isFolder, count: ctx.n };
}

/**
 * Saves a Google Doc / Sheet / Slides file as .docx / .xlsx / .pptx (or as PDF) next to the original.
 * The original stays untouched. fmt: 'office' or 'pdf'.
 */
function exportAs(id, fmt) {
  const OFFICE = {
    'application/vnd.google-apps.document':     ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    'application/vnd.google-apps.spreadsheet':  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx']
  };
  const src = Drive.Files.get(id, { fields: 'id,name,mimeType,parents', supportsAllDrives: true });
  const target = fmt === 'pdf' ? ['application/pdf', 'pdf'] : OFFICE[src.mimeType];
  if (!target || src.mimeType.indexOf('application/vnd.google-apps.') !== 0) {
    throw new Error('Only Google Docs, Sheets and Slides can be saved this way.');
  }
  const name = src.name.replace(/\.(docx|xlsx|pptx|pdf)$/i, '') + '.' + target[1];
  const parent = (src.parents && src.parents[0]) || 'root';
  const blob = exportBlob_(id, target[0]).setName(name).setContentType(target[0]);
  const nf = Drive.Files.create({ name: name, parents: [parent], mimeType: target[0] }, blob,
                                { supportsAllDrives: true, fields: 'id' });
  const f = Drive.Files.get(nf.id, { fields: ITEM_FIELDS, supportsAllDrives: true });
  const bucket = { folders: [], files: [] };
  classify_(f, bucket, false);
  const root = myRootId_();
  return { item: bucket.files[0], key: (parent === 'root' || parent === root) ? '__root' : parent };
}

/** Downloads a Google file converted to the given MIME type (Drive export, max 10 MB). */
function exportBlob_(id, mime) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
              '/export?mimeType=' + encodeURIComponent(mime);
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    if (/exportSizeLimitExceeded/.test(resp.getContentText())) {
      throw new Error('The file is too large to convert (Google limit: 10 MB).');
    }
    throw new Error('Google could not convert the file (' + resp.getResponseCode() + ').');
  }
  return resp.getBlob();
}

/**
 * Converts a Markdown (.md) file to a Google Doc ('gdoc') or a Word file ('docx') next to the original.
 * Google Docs imports Markdown natively (headings, bold, lists, links, tables).
 * For .docx a temporary Google Doc is created, exported and moved to Trash.
 */
function convertMarkdown(id, target) {
  const src = Drive.Files.get(id, { fields: 'id,name,mimeType,parents', supportsAllDrives: true });
  if (!/\.(md|markdown)$/i.test(src.name) && src.mimeType !== 'text/markdown') {
    throw new Error('Only Markdown (.md) files can be converted this way.');
  }
  const resp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
                                 '?alt=media&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Could not read the file (' + resp.getResponseCode() + ').');
  const base = src.name.replace(/\.(md|markdown)$/i, '');
  const parent = (src.parents && src.parents[0]) || 'root';
  const md = resp.getBlob().setContentType('text/markdown').setName(base);
  const DOC = 'application/vnd.google-apps.document';
  const doc = Drive.Files.create({ name: base, parents: [parent], mimeType: DOC }, md,
                                 { supportsAllDrives: true, fields: 'id' });
  let newId = doc.id;
  if (target === 'docx') {
    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const blob = exportBlob_(doc.id, DOCX).setName(base + '.docx').setContentType(DOCX);
    newId = Drive.Files.create({ name: base + '.docx', parents: [parent], mimeType: DOCX }, blob,
                               { supportsAllDrives: true, fields: 'id' }).id;
    Drive.Files.update({ trashed: true }, doc.id, null, { supportsAllDrives: true, fields: 'id' });
  }
  const f = Drive.Files.get(newId, { fields: ITEM_FIELDS, supportsAllDrives: true });
  const bucket = { folders: [], files: [] };
  classify_(f, bucket, false);
  const root = myRootId_();
  return { item: bucket.files[0], key: (parent === 'root' || parent === root) ? '__root' : parent };
}

/**
 * Run this once from the editor (select "authorize" → Run) after installing or updating,
 * so Google asks for all permissions the app needs. It only reads your account name.
 */
function authorize() {
  const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  Drive.Files.list({ pageSize: 1, fields: 'files(id)' });
  Logger.log('All permissions OK for ' + JSON.parse(r.getContentText()).user.emailAddress + ' (' + Session.getEffectiveUser().getEmail() + ')');
}

/** Email address of the signed-in owner (for opening Gmail and downloads in the right account). */
function getMyEmail() {
  return Session.getEffectiveUser().getEmail();
}

/** The file's content: Google Docs/Sheets/Slides as .docx/.xlsx/.pptx, other Google files as PDF, others as they are. */
function fileBlob_(id) {
  const OFFICE = {
    'application/vnd.google-apps.document':     ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    'application/vnd.google-apps.spreadsheet':  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx']
  };
  const src = Drive.Files.get(id, { fields: 'id,name,mimeType', supportsAllDrives: true });
  if (src.mimeType === FOLDER) return zipFolder_(id, 40 * 1024 * 1024);
  if (src.mimeType === SHORTCUT) throw new Error('Shortcuts cannot be sent as attachments.');
  if (src.mimeType.indexOf('application/vnd.google-apps.') === 0) {
    const t = OFFICE[src.mimeType] || ['application/pdf', 'pdf'];
    return exportBlob_(id, t[0]).setName(src.name + '.' + t[1]).setContentType(t[0]);
  }
  const resp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
                                 '?alt=media&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Could not read the file (' + resp.getResponseCode() + ').');
  return resp.getBlob().setName(src.name);
}

/** Packs a folder (with subfolders) into one .zip; Google files go in as .docx/.xlsx/.pptx (or PDF). */
function zipFolder_(id, maxBytes) {
  const src = Drive.Files.get(id, { fields: 'id,name', supportsAllDrives: true });
  const out = [], ctx = { deadline: Date.now() + 4 * 60 * 1000, size: 0, max: maxBytes, skipped: 0 };
  collectFiles_(id, '', out, ctx);
  if (!out.length) throw new Error('The folder is empty.');
  return Utilities.zip(out, src.name + '.zip');
}

function collectFiles_(folderId, prefix, out, ctx) {
  let token;
  do {
    const r = Drive.Files.list({
      q: "'" + folderId + "' in parents and trashed = false", pageSize: 1000, pageToken: token,
      fields: 'nextPageToken,files(id,name,mimeType)', supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    (r.files || []).forEach(f => {
      if (Date.now() > ctx.deadline) throw new Error('The folder is too big to pack in time – download it from Google Drive instead.');
      if (f.mimeType === FOLDER) { collectFiles_(f.id, prefix + f.name + '/', out, ctx); return; }
      if (f.mimeType === SHORTCUT) return;
      let b;
      try { b = fileBlob_(f.id); } catch (e) { ctx.skipped++; return; }
      ctx.size += b.getBytes().length;
      if (ctx.size > ctx.max) {
        throw new Error('The folder is larger than ' + Math.round(ctx.max / 1048576) + ' MB – download it from Google Drive instead.');
      }
      out.push(b.setName(prefix + b.getName()));
    });
    token = r.nextPageToken;
  } while (token);
}

/** A folder as a .zip for downloading in the browser (up to about 40 MB). */
function downloadFolder(id) {
  const z = zipFolder_(id, 40 * 1024 * 1024);
  return { name: z.getName(), data: Utilities.base64Encode(z.getBytes()) };
}

/** Gives people access to a file or folder by email (role: reader, commenter or writer). */
function shareWith(id, emails, role, notify) {
  if (['reader', 'commenter', 'writer'].indexOf(role) < 0) throw new Error('Unknown role.');
  const list = (emails || []).map(e => String(e).trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!list.length) throw new Error('Please enter a valid email address.');
  list.forEach(e => Drive.Permissions.create({ type: 'user', role: role, emailAddress: e }, id,
    { sendNotificationEmail: !!notify, supportsAllDrives: true, fields: 'id' }));
  return list.length;
}

function isInside_(folderId, ancestorId, root) {
  let id = folderId;
  for (let i = 0; i < 60 && id && id !== root; i++) {
    if (id === ancestorId) return true;
    const p = Drive.Files.get(id, { fields: 'parents', supportsAllDrives: true }).parents;
    id = p && p[0];
  }
  return false;
}

function createIn_(meta) {
  try {
    return Drive.Files.create(meta, null, { supportsAllDrives: true, fields: 'id' });
  } catch (e) {
    return Drive.Files.create(meta); // fallback
  }
}

function copyFile_(f, name, parent) {
  if (f.mimeType === SHORTCUT) {
    const s = Drive.Files.get(f.id, { fields: 'shortcutDetails(targetId)', supportsAllDrives: true });
    return createIn_({ name: name, mimeType: SHORTCUT, parents: [parent],
                       shortcutDetails: { targetId: s.shortcutDetails.targetId } }).id;
  }
  return Drive.Files.copy({ name: name, parents: [parent] }, f.id, { supportsAllDrives: true, fields: 'id' }).id;
}

function copyFolder_(id, name, parent, ctx) {
  const nf = createIn_({ name: name, mimeType: FOLDER, parents: [parent] });
  list_("'" + id + "' in parents and trashed = false").forEach(c => {
    if (Date.now() > ctx.deadline) {
      throw new Error('The folder is too large to copy at once – ' + ctx.n + ' items were copied to "' + name + '".');
    }
    ctx.n++;
    if (c.mimeType === FOLDER) copyFolder_(c.id, c.name, nf.id, ctx);
    else copyFile_(c, c.name, nf.id);
  });
  return nf.id;
}

function sharedWithMe_() {
  const data = { folders: [], files: [] };
  list_('sharedWithMe and trashed = false').forEach(f => classify_(f, data, true));
  return sorted_(data);
}

function sharedDrives_() {
  const data = { folders: [], files: [] };
  let pageToken;
  do {
    const r = Drive.Drives.list({ pageSize: 100, pageToken: pageToken });
    (r.drives || []).forEach(d => data.folders.push({
      id: d.id,
      name: d.name,
      url: 'https://drive.google.com/drive/folders/' + d.id,
      icon: '🗄️',
      lpath: 'Shared drives/' + d.name
    }));
    pageToken = r.nextPageToken;
  } while (pageToken);
  if (!data.folders.length) data.notice = 'You are not a member of any shared drive.';
  return sorted_(data);
}

function list_(q) {
  const out = [];
  let pageToken;
  do {
    const r = Drive.Files.list({
      q: q,
      fields: FIELDS,
      pageSize: 1000,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives'
    });
    (r.files || []).forEach(f => out.push(f));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

function classify_(f, bucket, withOwner) {
  const owner = withOwner ? owner_(f) : '';
  const parent = (f.parents && f.parents[0]) || '';
  if (f.mimeType === FOLDER) {
    bucket.folders.push({ id: f.id, name: f.name, url: f.webViewLink, owner: owner, parent: parent,
                          color: f.folderColorRgb || '', emoji: (f.properties && f.properties.dsIcon) || '',
                          starred: !!f.starred });
    return;
  }
  if (f.mimeType === SHORTCUT && f.shortcutDetails && f.shortcutDetails.targetMimeType === FOLDER) {
    const t = f.shortcutDetails.targetId;
    bucket.folders.push({ id: t, name: f.name, url: 'https://drive.google.com/drive/folders/' + t, icon: '🔗' });
    return;
  }
  bucket.files.push({
    id: f.id,
    name: f.name,
    url: f.webViewLink,
    mime: f.mimeType,
    size: Number(f.size || 0),
    updated: Date.parse(f.modifiedTime),
    owner: owner,
    parent: parent,
    starred: !!f.starred
  });
}

function owner_(f) {
  const o = f.owners && f.owners[0];
  return o ? (o.displayName || o.emailAddress || '') : '';
}

function myRootId_() {
  const cache = CacheService.getUserCache();
  let id = cache.get('rootId');
  if (!id) {
    id = Drive.Files.get('root', { fields: 'id' }).id;
    cache.put('rootId', id, 21600);
  }
  return id;
}

function sorted_(data) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  data.folders.sort((a, b) => collator.compare(a.name, b.name));
  data.files.sort((a, b) => collator.compare(a.name, b.name));
  return data;
}
