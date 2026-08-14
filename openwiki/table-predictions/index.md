# Files

- [Table Prediction API Routes](api-routes.md) - Three route handlers (assign, unassign, submit) now backed by transactional Postgres RPCs that enforce the lock deadline against DB time. Direct CRUD and retry logic replaced.
- [Table Prediction Board Logic](board-logic.md) - Pure state-transition functions for the Band-fill capture board — filling-phase tap, review-phase drop/swap, undo, roster ordering, and fill-tone display logic.
- [Table Prediction Capture Rules](capture-rules.md) - The 7 Table Bands, team-to-band assignment model, validation of band sizes, late-joiner rules, and editability/lock timing for Predict the Table. Lock is based on a fixed UTC deadline, not Gameweek 1 kickoff.
- [Table Prediction Data Access](data-access.md) - DB-fetching glue layer between the pure decision logic and the API routes/PredictTable page, providing database time, gameweek-one kickoff, editability, player lookup, and table-prediction record queries.
- [Table Prediction React Flow](react-flow.md) - The client-side PredictTableFlow component — state management, optimistic persistence with rollback, lock countdown, submission celebration (SubmittedMoment), and the BandsBoard rendering tree.
