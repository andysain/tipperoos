# Files

- [Table Prediction API Routes](api-routes.md) - Four route handlers (assign, unassign, submit, skip) for table prediction CRUD operations, all enforcing session auth, CSRF, lock/late-joiner rules.
- [Table Prediction Board Logic](board-logic.md) - Pure state-transition functions for the Band-fill capture board — filling-phase tap, review-phase drop/swap, undo, roster ordering, and fill-tone display logic.
- [Table Prediction Capture Rules](capture-rules.md) - The 7 Table Bands, team-to-band assignment model, validation of band sizes, late-joiner rules, and editability/lock timing for Predict the Table.
- [Table Prediction Data Access](data-access.md) - DB-fetching glue layer between the pure decision logic and the API routes, providing gameweek-one kickoff, editability, player lookup, and table-prediction record queries.
- [Table Prediction React Flow](react-flow.md) - The client-side PredictTableFlow component — state management, optimistic persistence with rollback, lock countdown, submission celebration (SubmittedMoment), and the BandsBoard rendering tree.
