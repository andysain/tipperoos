import readline from "node:readline";

// Plain interactive prompt (input echoed normally) -- for non-secret values
// like a name or an optional emoji, where promptHidden's masking would just
// be confusing.
export function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Hidden interactive prompt (input not echoed to the terminal), no
// third-party dependency -- mutes stdout while readline's own internal
// writes happen, matching the common Node "password prompt" pattern.
export function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function hiddenWrite(stringToWrite) {
      if (stringToWrite.trim() === question.trim()) {
        originalWrite.call(rl, stringToWrite);
      }
      // Otherwise: swallow the echoed keystrokes.
    };

    rl.question(question, (answer) => {
      if (Array.isArray(rl.history)) {
        rl.history = rl.history.slice(1);
      }
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}
