
const { Kafka } = require('kafkajs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const kafka = new Kafka({
  clientId: 'analytics-consumer-v1',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'analytics-group' });

// In-memory analytics (you can also store in DB)
const analytics = {
  totalGames: 0,
  totalMoves: 0,
  totalDuration: 0,
  gamesPerHour: {},
  winnerCounts: {},
  playerStats: {}
};

async function runConsumer() {
  await consumer.connect();
  console.log(' Analytics Consumer connected');

  await consumer.subscribe({ topic: 'game-analytics', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value.toString());
      
      console.log(`Analytics Event: ${event.type}`, event);

      switch (event.type) {
        case 'player_created':
          handlePlayerCreated(event);
          break;
        
        case 'game_started':
          handleGameStarted(event);
          break;
        
        case 'move_made':
          handleMoveMade(event);
          break;
        
        case 'game_ended':
          await handleGameEnded(event);
          break;
      }
    }
  });
}

function handlePlayerCreated(event) {
  console.log(`New player: ${event.username}`);
}

function handleGameStarted(event) {
  const hour = new Date().getHours();
  analytics.gamesPerHour[hour] = (analytics.gamesPerHour[hour] || 0) + 1;
  
  console.log(`Game started: ${event.gameId} | vs Bot: ${event.vsBot}`);
}

function handleMoveMade(event) {
  analytics.totalMoves++;
}

async function handleGameEnded(event) {
  analytics.totalGames++;
  analytics.totalDuration += event.duration;

  // Track winner
  if (event.winnerId && event.winnerId !== 'bot') {
    analytics.winnerCounts[event.winnerId] = (analytics.winnerCounts[event.winnerId] || 0) + 1;
  }

  // Calculate metrics
  const avgDuration = (analytics.totalDuration / analytics.totalGames).toFixed(2);
  
  console.log('\n📈 === ANALYTICS SUMMARY ===');
  console.log(`Total Games: ${analytics.totalGames}`);
  console.log(`Total Moves: ${analytics.totalMoves}`);
  console.log(`Average Game Duration: ${avgDuration}s`);
  console.log(`Games This Hour: ${analytics.gamesPerHour[new Date().getHours()] || 0}`);
  console.log(`Winner: ${event.winnerId} | Duration: ${event.duration}s`);
  console.log('===========================\n');

  // Store analytics snapshot in database
// Store analytics snapshot in database
await prisma.$executeRaw`
  INSERT INTO analytics_snapshots (id, total_games, avg_duration, snapshot_time)
  VALUES (gen_random_uuid()::text, ${analytics.totalGames}, ${parseFloat(avgDuration)}, NOW())
`;}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});

runConsumer().catch(console.error);