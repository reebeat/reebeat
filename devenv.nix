{ pkgs, lib, ... }:
let
  # nixpkgs builds Chromium for Linux only; elsewhere set REEBEAT_CHROMIUM to a local browser.
  chromium = lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.chromium;
in
{
  # Toolchain only. Vite+ needs Node >= 22.18 (root package.json engines).
  # gitleaks scans staged changes (pre-commit hook) and the full history (CI) for secrets; its
  # rules live in .gitleaks.toml. The git hooks and CI resolve every tool (vp, gitleaks,
  # commitlint) from this shell's PATH, so they run in the same pinned toolchain.
  # Release 1 (spec 0001) also needs, all substitutable from cache.nixos.org (nothing is built):
  # Chromium for the Playwright capture (driven through executablePath, so the version of
  # playwright-core and of the browser are independent), ffmpeg/ffprobe for audio and the mux
  # (the headless variant has libx264, AAC, FLAC and mov_text and none of the display stack), and
  # whisper.cpp for word timestamps.
  packages = [
    pkgs.bun
    pkgs.nodejs_24
    pkgs.gitleaks
    pkgs.ffmpeg-headless
    pkgs.whisper-cpp
  ]
  ++ chromium;

  env = lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
    REEBEAT_CHROMIUM = lib.getExe pkgs.chromium;
  };
}
