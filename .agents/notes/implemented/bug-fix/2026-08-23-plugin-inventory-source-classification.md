# Agent Note: pluginInventory classified user-installed bundles as native

Status: implemented

English | [中文](2026-08-23-plugin-inventory-source-classification.zh.md)

## Problem

`pluginInventory/list` derives each entry's `source` from the booted profile manifest. The first rule read the user-install record as the profile's `dependencies` **minus** every name in `dsh.profile.bundles`, on the stated premise that "the reconciler also lists bundles as dependencies, so they must not classify as user libraries". That premise conflates two kinds of bundles: installation-owned template bundles (`@deepseek-ai/dsh-base`, `dsh-web-app`) never become profile dependencies — `reconcilePlugins` writes dependencies only for packages a `dsh plugin` install brings in. A user-installed bundle therefore lands in both lists and the subtraction misfiled it as `native`: installing a personal bundle through the documented `dsh plugin add` flow showed it under 原生插件 in the 插件 management panel, contradicting both the panel's own legend (`library` = a package the user installed into the profile) and the actual provenance.

## Decision

`readProfileLibraryNames` returns exactly the profile manifest's `dependencies`. Membership alone is the user-install record: everything `dsh plugin` installs into the profile — plain libraries and user bundles alike — reads as `library`; names absent from dependencies (template bundles, `cordis:` builtins, unresolvable specifiers) stay `native`. The rule needs no knowledge of which layer introduced an entry, so no provenance model is added.

## Alternatives considered

**Subtract only template bundles** (match `PROFILE_TEMPLATES`/`DEFAULT_PROFILE_BUNDLES`). Rejected: it couples the Host package to launcher constants across the boot boundary and still guesses at hand-edited manifests; the dependency record is the single writer-owned fact.

**Keep the subtraction and tell users to ignore the label.** Rejected: the panel is the product surface for "what did I install"; a classification that lies for the documented install flow is a bug, not cosmetics.

## Consequences

- A user-installed bundle now shows under 库 (libraries) with its declared description and version; disabling/uninstalling behavior is unchanged (`setEnabled` already wrote to the profile user layer regardless of class).
- An in-box bundle explicitly added as a dependency (`pnpm dsh plugin --profile <name> add @deepseek-ai/dsh-web-app`) would reclassify as `library` — acceptable, since the manifest then genuinely records a user action.
- Tests: the fixture now models a user-installed bundle (dependency + layer) beside a template bundle (layer only) and asserts `library` vs `native` respectively; the old "bundle stays native despite being a dependency" expectation was the bug under test and is gone.

## Testing

`packages/host/plugin-inventory/tests/inventory.spec.ts` covers all three provenance shapes against one fixture profile: plain library → `library`, user-installed bundle (dependency + `dsh.profile.bundles`) → `library`, template bundle (layer only) → `native`, plus the existing unresolvable/builtin/subpath natives and manifest failure modes.
