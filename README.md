# QA – Manual Test Cases

Manual test cases for the **Recruitment & Hiring Tracker** built for Altrium (Private) Limited.  
Live system: https://altrium-recruitment.vercel.app/

Prepared by **Vidusha Athukoralage** (QA Engineer) as part of a five-member Scrum team.

## Summary

| Sprint | Backlog items | Features | Test cases | Passed | Failed | File |
|---|---|---|---|---|---|---|
| Sprint 1 | PB01–PB05 | 5 | 32 | 32 | 0 | [sprint-1-test-cases.md](sprint-1-test-cases.md) |
| Sprint 2 | PB06–PB10 | 5 | 22 | 22 | 0 | [sprint-2-test-cases.md](sprint-2-test-cases.md) |

## Approach

- Each test case lists preconditions, numbered steps, the expected outcome, the actual outcome and a pass/fail status.
- Positive, negative and security cases were written for every feature (for example invalid logins, invalid Sri Lankan NIC numbers, unreadable PDF CVs and access to pages without the correct role).
- All tests were executed against the deployed system on Vercel.
