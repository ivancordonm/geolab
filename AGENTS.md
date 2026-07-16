# Development workflow

Always use the skill "full-dev-flow" for any coding request.

Never implement directly.

Follow:

1. Explore
2. Plan
3. Implement
4. Test
5. Review

# Build version counter

Before every push to `main`, increment the integer in the root `VERSION` file
by 1, then run `npm run sync-version` from `frontend/` to update the
committed `frontend/VERSION` mirror, and include both file changes in the
pushed commit(s). This powers the `v.<N>` build indicator shown in the app UI
(bottom-left corner, above the "An Anticentro Lab project" credit).
