// Executables a rule must never target: Windows would break, or the agent would kill
// its own helpers. Mirrors `src/main/protected.ts` in the agent (keep both in sync).
const PROTECTED_EXES = new Set([
  "applicationframehost.exe",
  "conhost.exe",
  "csrss.exe",
  "ctfmon.exe",
  "ctrlaltbro.exe",
  "dwm.exe",
  "electron.exe",
  "explorer.exe",
  "fontdrvhost.exe",
  "lockapp.exe",
  "logonui.exe",
  "lsass.exe",
  "powershell.exe",
  "rundll32.exe",
  "searchhost.exe",
  "sechealthui.exe",
  "services.exe",
  "shellexperiencehost.exe",
  "sihost.exe",
  "smss.exe",
  "startmenuexperiencehost.exe",
  "svchost.exe",
  "taskkill.exe",
  "taskmgr.exe",
  "textinputhost.exe",
  "wininit.exe",
  "winlogon.exe",
]);

export const isProtectedExe = (exeName: string) => PROTECTED_EXES.has(exeName.toLowerCase());
