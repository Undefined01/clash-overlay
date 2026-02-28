{ pkgs ? import <nixpkgs> {} }:

# `nix-shell` to enter the development environment
# `nix-shell --run "pnpm install"` to run commands in the development environment without entering it
pkgs.mkShell {
    name = "dev-shell";
    buildInputs = [
        pkgs.nodejs
        pkgs.pnpm
    ];
}
