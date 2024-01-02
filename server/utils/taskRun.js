async function concurrentTaskRunner(concurrency, tasks, callback) {
  const results = [];
  const runningTasks = [];

  const runNextTask = async () => {
    while (tasks.length > 0 || runningTasks.length > 0) {
      if (runningTasks.length < concurrency && tasks.length > 0) {
        const task = tasks.shift();
        const result = task();
        const taskPromise = result.then(() => {
          runningTasks.splice(runningTasks.indexOf(taskPromise), 1);
          runNextTask();
        });
        runningTasks.push(taskPromise);
        results.push(result);
      } else {
        await Promise.race(runningTasks);
      }
    }

    if (typeof callback === 'function') {
      callback(results);
    }
  };

  runNextTask();

  return Promise.all(results);
}

const tasks = [
  () => new Promise((resolve) => setTimeout(() => resolve('Task 1'), 1000)),
  () => new Promise((resolve) => setTimeout(() => resolve('Task 2'), 2000)),
  () => new Promise((resolve) => setTimeout(() => resolve('Task 3'), 1000)),
  // Add more tasks as needed
];

concurrentTaskRunner(2, tasks, (results) => {
  console.log('All tasks completed:', results);
});
