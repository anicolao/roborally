{
  description = "Robo Rally 2005 browser game development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachSystem [
      "aarch64-darwin"
      "aarch64-linux"
      "x86_64-linux"
    ] (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            actionlint
            bash
            bun
            coreutils
            gh
            git
            jdk
            ripgrep
            shellcheck
          ];

          shellHook = ''
            export XDG_CACHE_HOME="$PWD/.firebase/cache"
          '';
        };
      });
}
