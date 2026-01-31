// services/kafkaProducer.js
const { Kafka } = require('kafkajs');

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'four-in-a-row-game',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        retries: 3,
        initialRetryTime: 100
      }
    });

    this.producer = this.kafka.producer();
    this.isConnected = false;
    
  }

  async connect() {
    if (process.env.KAFKA_ENABLED !== 'true') {
    // console.log('ℹ Kafka disabled - running without analytics');
    return;
  }
    try {
      await this.producer.connect();
      this.isConnected = true;
      console.log(' Kafka Producer connected');
    } catch (error) {
      console.error('❌ Kafka Producer connection failed:', error.message);
      // Gracefully continue without Kafka if it's not available
      this.isConnected = false;
    }
  }

  async sendEvent(topic, event) {
    if (!this.isConnected) {
      console.log('⚠️ Kafka not connected, skipping event:', event.type);
      return;
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: event.gameId || event.playerId || 'system',
            value: JSON.stringify({
              ...event,
              timestamp: new Date().toISOString()
            })
          }
        ]
      });
      console.log(` Kafka event sent: ${event.type}`);
    } catch (error) {
      console.error(' Failed to send Kafka event:', error.message);
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.producer.disconnect();
      console.log('Kafka Producer disconnected');
    }
  }
}

module.exports = new KafkaProducer();