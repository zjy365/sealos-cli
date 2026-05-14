# sealos-cli

## 0.1.0

### Minor Changes

- Complete Sealos authentication flow with OAuth2 device login.
- Add auth persistence for `~/.sealos/auth.json` and `~/.sealos/kubeconfig`.
- Add workspace listing and switching support backed by refreshed regional tokens and kubeconfig.
- Wire auth commands for login, logout, whoami, auth info/check/list/switch.
