# AI Mobile Team – Workflow

Agents live in `.github/agents/` and all use model `claude-opus-5.5`. Each acts like a company role with defined inputs, outputs and gates.

## Roles
| Agent | Role | Owns |
|---|---|---|
| `orchestrator` | Engineering Manager | flow, gates, escalation |
| `product-owner` | PO | `spec.md` |
| `ux-ui-designer` | UX/UI | `design.md` |
| `qa-tdd-tester` | QA / TDD | `test-plan.md`, tests (RED), verification |
| `android-developer` | Android dev | Kotlin/Compose code |
| `ios-developer` | iOS dev | Swift/SwiftUI code |

## Flow
```mermaid
flowchart TD
    U([User: feature idea]) --> O[orchestrator]
    O --> PO[product-owner<br/>spec.md]
    PO --> G1{Gate 1<br/>ACs testable?}
    G1 -- no --> PO
    G1 -- yes --> UX[ux-ui-designer<br/>design.md]
    UX --> G2{Gate 2<br/>every AC mapped to<br/>screen + states?}
    G2 -- no --> UX
    G2 -- gap in spec --> PO
    G2 -- yes --> QA1[qa-tdd-tester<br/>test-plan + failing tests RED]
    QA1 --> G3{Gate 3<br/>fail for right reason?}
    G3 -- no --> QA1
    G3 -- untestable AC --> PO
    G3 -- yes --> AND[android-developer]
    G3 -- yes --> IOS[ios-developer]
    AND --> QA2[qa-tdd-tester<br/>verify GREEN + traceability]
    IOS --> QA2
    QA2 --> G4{Gate 4<br/>all ACs green?}
    G4 -- defects --> AND
    G4 -- defects --> IOS
    G4 -- yes --> R[orchestrator<br/>summary + hand-off]
    R --> U
```

## Artifacts per feature
```
docs/features/<name>/
  spec.md        # product-owner
  design.md      # ux-ui-designer
  test-plan.md   # qa-tdd-tester (AC → test traceability)
```

## Usage
```
copilot --agent orchestrator
> Build feature: biometric login for the mobile app
```
Or call a single role directly, e.g. `copilot --agent qa-tdd-tester`.

## Change rules
- Spec changes restart the flow from the affected stage and notify downstream roles.
- Max 3 rework loops per gate, then escalate to the user.
