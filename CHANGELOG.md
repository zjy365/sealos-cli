# sealos-cli

## 1.1.3

### Patch Changes

- Add database public access aliases and return console-compatible public connection strings.

## 1.1.2

### Patch Changes

- Default registered CLI commands to JSON output for agent and automation use. Human-readable table output remains available with `-o table`, and database logs keep explicit plain text support with `-o plain`.

## 1.1.0

### Minor Changes

- Align the v1 release surface around the `sealos-cli` command name and package version output.

## 1.0.0

### Major Changes

- Release the core Sealos CLI with auth, workspace, devbox, database, and template commands.

## 0.1.0

### Minor Changes

- Complete Sealos authentication flow with OAuth2 device login.
- Add auth persistence for `~/.sealos/auth.json` and `~/.sealos/kubeconfig`.
- Add workspace listing and switching support backed by refreshed regional tokens and kubeconfig.
- Wire auth commands for login, logout, whoami, auth info/check/list/switch.
