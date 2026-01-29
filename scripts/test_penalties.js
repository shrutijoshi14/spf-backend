const service = require('../services/automaticPenalty.service');
async function run() {
  try {
    console.log('Starting service call...');
    const result = await service.checkDailyPenalties();
    console.log('Result:', result);
  } catch (err) {
    console.error('Caught Error:', err);
  } finally {
    process.exit();
  }
}
run();
