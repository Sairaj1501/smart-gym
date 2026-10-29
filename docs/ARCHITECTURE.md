# Architecture

## Layers and data flow

```mermaid
flowchart LR
  subgraph Presentation["Presentation layer (React + Tailwind + Recharts)"]
    UI[Role-based dashboards and forms]
  end
  subgraph API["REST / integration layer (Express)"]
    MW[JWT auth · role check · object-level access · zod validation · rate limit]
    R[Route modules]
  end
  subgraph App["Application layer (services)"]
    MS[Membership and renewal rules]
    PS[Payment rules: idempotent, overpayment-proof]
    ES[Engagement analysis]
    RM[Reminder job]
  end
  subgraph AI["Recommendation layer (replaceable)"]
    DE[Diet rule engine]
    WE[Workout rule engine]
    CB[Chatbot rules]
    LLM[Optional LLM narrator / chat]
  end
  subgraph Data["Data layer (MongoDB + Mongoose)"]
    DB[(Collections and indexes)]
  end
  subgraph Ext["External services (all optional)"]
    A[LLM API]
    X[Email / SMS / Gateway / Image store: not integrated]
  end
  UI -->|HTTPS + Bearer token| MW --> R --> MS & PS & ES & RM
  R --> DE & WE & CB
  CB -.fallback.-> LLM -.-> A
  MS & PS & ES & RM & DE & WE --> DB
  RM --> DB
```

The AI layer is isolated in `services/dietEngine.js`, `workoutEngine.js`, `chatbotRules.js`, `coach.js` and `llm.js`. Swapping the LLM provider means editing only `llm.js`.

## Entity relationships

```mermaid
erDiagram
  USER ||--o| MEMBER : "is"
  USER ||--o| TRAINER : "is"
  TRAINER ||--o{ MEMBER : "assigned to"
  MEMBER ||--o{ MEMBER_MEMBERSHIP : "has history of"
  MEMBERSHIP_PLAN ||--o{ MEMBER_MEMBERSHIP : "sold as (snapshot)"
  MEMBER_MEMBERSHIP ||--o{ PAYMENT : "paid by"
  MEMBER ||--o{ PAYMENT : "makes"
  MEMBER ||--o{ ATTENDANCE : "checks in (unique per day)"
  MEMBER ||--o{ HEALTH_METRIC : "records (needs consent)"
  MEMBER ||--o{ WORKOUT_PLAN : "receives"
  WORKOUT_PLAN ||--o{ WORKOUT_LOG : "logged against"
  MEMBER ||--o{ DIET_PLAN : "receives"
  DIET_PLAN ||--o{ DIET_ADHERENCE : "tracked by"
  MEMBER ||--o{ PT_SESSION : "books"
  TRAINER ||--o{ PT_SESSION : "delivers"
  USER ||--o{ NOTIFICATION : "receives"
  USER ||--o{ AUDIT_LOG : "performs"
  MEMBER ||--o{ FEEDBACK : "writes"
```

Key constraints: unique `User.email`, `Member.phone`, `Member.memberCode`, `Payment.receiptNo`, `Payment.idempotencyKey` (sparse), `Attendance(member, dayKey)`, `Notification(user, dedupeKey)` (partial), `DietAdherence(plan, day, slot)`. Memberships, payments and attendance are append-only history: renewals and plan changes create new documents.

## Sequence: payment (why double-clicks cannot double-charge)

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB
  UI->>API: POST /payments {amount, idempotencyKey}
  API->>DB: find payment by idempotencyKey
  alt already exists
    DB-->>API: payment
    API-->>UI: 200 {duplicate: true}
  else new
    API->>DB: atomic $inc amountPaid only if amountPaid + amount <= amountDue
    alt would overpay
      API-->>UI: 422 overpayment
    else ok
      API->>DB: insert payment (unique receiptNo, unique key)
      alt insert fails
        API->>DB: roll back $inc
      end
      API-->>UI: 201
    end
  end
```

## Use cases

Admin: manage plans, trainers, settings; see revenue, workload, audit log; refund. Staff: register, assign/renew, check in, record payments, print receipts. Trainer: review assigned members, approve or edit plans, record assessments, schedule sessions. Member: view membership, check in by QR, track health (with consent), generate plans, log workouts and meals, chat, request help.
