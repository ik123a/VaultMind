{
  description = "VaultMind - Offline-First AI Governance";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_22;
      in {
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "vaultmind";
          version = "0.1.0";
          src = ./.;

          buildInputs = [ nodejs ];

          buildPhase = ''
            npm ci
            cd packages/vm-core && npx tsc
            cd ../vm-sandbox && npx tsc
            cd ../mcp-gateway && npx tsc
            cd ../cli && npx tsc
            cd ../sdk && npx tsc
          '';

          installPhase = ''
            mkdir -p $out/lib/vaultmind
            cp -r packages/ $out/lib/vaultmind/
            cp package.json $out/lib/vaultmind/
            mkdir -p $out/bin
            cat > $out/bin/vaultmind <<EOF
#!${pkgs.runtimeShell}
exec ${nodejs}/bin/node $out/lib/vaultmind/packages/cli/dist/index.js "$@"
EOF
            chmod +x $out/bin/vaultmind
          '';

          meta = {
            description = "Offline-First AI Environment for Sensitive Code";
            license = pkgs.lib.licenses.mit;
          };
        };

        devShell = pkgs.mkShell {
          buildInputs = [ nodejs pkgs.nodePackages.typescript ];
        };
      });
}
