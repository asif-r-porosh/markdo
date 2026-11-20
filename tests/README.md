# Tests

Playwright (headless Chromium) driven by Node's built-in test runner.

    npm install
    npx playwright-core install chromium     # once
    npm test                                 # everything

`regression.test.js` holds the guards for the fixed audit findings (numbered as
in the audit). A newly found bug goes into `known-bugs.test.js` as a test of the
correct behaviour marked `todo`; when it is fixed, move it to `regression.test.js`
and drop the `todo` option.

Set `CHROMIUM_PATH` to use a specific browser binary.

The app uses ES modules, so the tests serve the repo folder over a small local
static server (`tests/helpers.js`); `file://` does not work.
