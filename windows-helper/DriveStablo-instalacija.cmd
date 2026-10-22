@echo off
rem Drive stablo - instalacija pomocnika. Pokreni duplim klikom.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath '%~f0' -Raw -Encoding UTF8; iex $s.Substring($s.LastIndexOf('#==PS==' + '#'))"
echo.
pause
exit /b
#==PS==#
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'DriveStablo'
$exePath = Join-Path $dir 'otvori.exe'
$key = 'HKCU:\Software\Classes\drivestablo'

Write-Host ''
Write-Host '=== Drive stablo - pomocnik za otvaranje fajlova u Wordu, Excelu... ===' -ForegroundColor Cyan
$izbor = Read-Host 'Pritisni Enter za INSTALACIJU (ili upisi U pa Enter za uklanjanje)'
if ($izbor -match '^[uU]') {
    if (Test-Path $key) { Remove-Item -Path $key -Recurse -Force }
    if (Test-Path $dir) { Remove-Item -Path $dir -Recurse -Force }
    Write-Host 'Pomocnik je uklonjen.' -ForegroundColor Green
    return
}

try {
    $src = @'
using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Windows.Forms;

public static class DriveStabloOtvori
{
    static readonly string[] Dozvoljeno = {
        ".doc",".docx",".docm",".dot",".dotx",".rtf",".odt",".txt",".md",
        ".xls",".xlsx",".xlsm",".xlsb",".csv",".ods",
        ".ppt",".pptx",".pptm",".odp",
        ".pdf",".png",".jpg",".jpeg",".gif",".bmp",".tif",".tiff",".svg",
        ".msg",".eml",".xml",".json",".zip",".7z",".rar",
        ".mp3",".wav",".m4a",".mp4",".mov",".avi",".mkv" };

    static void Poruka(string t)
    {
        MessageBox.Show(t, "Drive stablo", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    [STAThread]
    public static void Main(string[] args)
    {
        try { Otvori(args.Length > 0 ? args[0] : ""); }
        catch (Exception e) { Poruka("Greška: " + e.Message); }
    }

    static void Otvori(string uri)
    {
        // drivestablo:open?p=<putanja kodirana za URL>
        int i = uri.IndexOf("?p=");
        if (i < 0) { Poruka("Neispravan link."); return; }
        string rel = Uri.UnescapeDataString(uri.Substring(i + 3));

        string[] delovi = rel.Split('/');
        if (delovi.Length < 2 || delovi.Any(d => d == "" || d == "." || d == "..") ||
            rel.IndexOfAny(new[] { ':', '*', '?', '"', '<', '>', '|', '\\' }) >= 0)
        { Poruka("Neispravna putanja:\n" + rel); return; }

        string ext = Path.GetExtension(delovi[delovi.Length - 1]).ToLowerInvariant();
        if (Array.IndexOf(Dozvoljeno, ext) < 0)
        { Poruka("Ova vrsta fajla (" + ext + ") se iz bezbednosnih razloga ne otvara automatski:\n" + rel); return; }

        string[] koreni;
        if (delovi[0] == "My Drive") koreni = new[] { "My Drive", "Moj disk", "Мој диск" };
        else if (delovi[0] == "Shared drives") koreni = new[] { "Shared drives", "Deljeni diskovi", "Дељени дискови" };
        else { Poruka("Nepoznat koren putanje: " + delovi[0]); return; }
        string ostatak = string.Join("\\", delovi.Skip(1).ToArray());

        // Disk Google Drive prepoznaje se po skrivenom folderu .shortcut-targets-by-id
        var diskovi = DriveInfo.GetDrives()
            .Where(d => d.DriveType == DriveType.Fixed || d.DriveType == DriveType.Network || d.DriveType == DriveType.Removable)
            .Where(d => Directory.Exists(Path.Combine(d.RootDirectory.FullName, ".shortcut-targets-by-id")))
            .ToList();
        if (diskovi.Count == 0)
            diskovi = DriveInfo.GetDrives().Where(d => d.Name.StartsWith("G", StringComparison.OrdinalIgnoreCase)).ToList();

        foreach (var d in diskovi)
            foreach (var k in koreni)
            {
                string puna = Path.Combine(Path.Combine(d.RootDirectory.FullName, k), ostatak);
                if (File.Exists(puna))
                {
                    Process.Start(new ProcessStartInfo(puna) { UseShellExecute = true });
                    return;
                }
            }
        Poruka("Fajl nije pronađen na Google Drive disku:\n" + rel + "\n\nProveri da li je Drive for desktop pokrenut.");
    }
}

'@
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    if (Test-Path $exePath) { Remove-Item -Path $exePath -Force }
    Write-Host 'Pravim otvori.exe (par sekundi)...'
    Add-Type -TypeDefinition $src -Language CSharp `
        -ReferencedAssemblies 'System.Windows.Forms', 'System.Core' `
        -OutputAssembly $exePath -OutputType WindowsApplication

    # Stara verzija pomocnika (PowerShell skripta) vise nije potrebna
    $staro = Join-Path $dir 'otvori.ps1'
    if (Test-Path $staro) { Remove-Item -Path $staro -Force }

    foreach ($k in @($key, "$key\shell", "$key\shell\open", "$key\shell\open\command")) {
        if (-not (Test-Path $k)) { New-Item -Path $k | Out-Null }
    }
    Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:Drive stablo'
    New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    $cmd = '"' + $exePath + '" "%1"'
    Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value $cmd

    $upisano = (Get-ItemProperty -Path "$key\shell\open\command").'(default)'
    if ((Test-Path $exePath) -and $upisano -eq $cmd) {
        Write-Host ''
        Write-Host 'USPESNO: pomocnik je instaliran (bez PowerShell prozora).' -ForegroundColor Green
        Write-Host "  Program:  $exePath"
        Write-Host ''
        Write-Host 'U Drive stablu klikni dugme sa ekranom pored fajla - otvara se odmah.'
    } else {
        Write-Host 'Nesto nije upisano kako treba - posalji Claudeu sliku ovog prozora.' -ForegroundColor Red
    }
} catch {
    Write-Host ''
    Write-Host ('GRESKA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Posalji Claudeu sliku ovog prozora.' -ForegroundColor Red
}
