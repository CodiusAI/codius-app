{
  description = "Codius - self-hosted daemon for AI coding agents";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          codius = pkgs.callPackage ./nix/package.nix { };
        in
        {
          default = codius;
          codius = codius;
          desktop = pkgs.callPackage ./nix/desktop-package.nix { inherit codius; };
        }
      );

      nixosModules.default = self.nixosModules.codius;
      nixosModules.codius =
        { pkgs, lib, ... }:
        {
          imports = [ ./nix/module.nix ];
          services.codius.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        };

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.python3
            ];
          };
        }
      );
    };
}
