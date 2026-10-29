# Test execution log

This file records only what has actually been executed, and by whom. Replace "Not run" with your own results before submitting anything.

## Executed by the author of this snapshot (sandbox: Node 22, no network, no MongoDB)

| Suite | Command | Result |
|---|---|---|
| Unit tests (dates, BMI, engagement, CSV, diet engine, workout engine, chatbot rules) | `npm run test:unit` | **42 tests, 42 passed, 0 failed** |
| Backend syntax check of every `src/**/*.js` file | `node --check` | No errors |
| Backend import/export cross-check | custom script | Consistent |
| Frontend JSX syntax parse (26 files) | TypeScript parser, planted error was detected | No syntax errors |
| Frontend import/identifier cross-check | custom script | Consistent |

## Written but NOT executed here

The sandbox had no network, so `npm install` and the MongoDB binary download were impossible.

| Suite | Command | Status |
|---|---|---|
| API integration tests (`server/tests/integration/workflows.test.js`, 21 tests) | `npm run test:integration` | **Not run** |
| Frontend build (`vite build`) and browser behaviour | `npm run build` / manual | **Not run** |
| Responsive layout on real devices | manual | **Not run** |

Expect to fix small issues the first time you run the integration tests and the build; that is normal, and fixing them is part of verifying the project.

## Mapping to the STP/TSR test cases (TC-01 to TC-15)

| TC | Case | Automated check | Status |
|---|---|---|---|
| 01 | Register member | integration: registration | Not run |
| 02 | Required-field validation | integration: field-level errors | Not run |
| 03 | Update member | manual | Not run |
| 04 | Create plan | integration setup | Not run |
| 05 | Assign membership / expiry | unit: end-date maths **Pass**; integration | Unit pass / integration not run |
| 06 | Renew | unit: renewal start **Pass**; integration history check | Unit pass / integration not run |
| 07 | Expiry identification | unit: status boundaries **Pass** | Pass (logic) |
| 08 | Record attendance | integration | Not run |
| 09 | Manage trainer | integration regression | Not run |
| 10 | Record payment | integration | Not run |
| 11 | Pending balance | integration | Not run |
| 12 | Invalid payment | integration (zero, overpayment) | Not run |
| 13 | Search/filter | manual | Not run |
| 14 | Related-record consistency | integration (renewal history, outstanding) | Not run |
| 15 | Responsive layout | manual | Not run |

## Defects found during development (by code review, not by test execution)

| ID | Where | What | Status |
|---|---|---|---|
| DEV-1 | plan and trainer update validation | `.partial()` combined with `.default()` would have reset omitted fields on PUT (for example, deactivating a trainer wiped specialization and experience) | Fixed; regression test written (not run) |
| DEV-2 | payments route | Member payment history cast the id through a dynamic import hack | Fixed |
| DEV-3 | chatbot service | LLM history could start with an assistant turn or repeat a role, which the API rejects | Fixed; falls back to rules on any failure |

The two uploaded defect-analysis and test-plan PDFs contain **illustrative** numbers (27 defects, 21 resolved). Do not submit those figures as real results. Use the table above and your own execution of the integration tests instead.
