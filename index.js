const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cron = require("node-cron");
const CryptoModel = require("./models/CryptoModel");

const app = express();

const PORT = 3000;

mongoose.connect('mongodb://localhost:27017/koinxCrypto');

// Background Job: Fetch data
const fetchCryptoData = async () => {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/coins/markets",
      {
        params: {
          vs_currency: "usd",
          ids: "bitcoin,matic-network,ethereum",
        },
      }
    );

    response.data.forEach((coin) => {
      const crypto = new CryptoModel({
        coin: coin.id,
        price: coin.current_price,
        marketCap: coin.market_cap,
        change24h: coin.price_change_percentage_24h,
      });
      crypto.save();
    });

    console.log("Crypto data fetched and stored in the database");
  } catch (error) {
    console.error("Error fetching crypto data:", error);
  }
};

// run every 2 hours
cron.schedule('0 */2 * * *', fetchCryptoData);


// API: Get latest data
app.get('/stats', async (req, res) => {
  const { coin } = req.query;
  if (!coin) return res.status(400).json({ error: 'Coin query param is required' });

  try {
    const latestData = await CryptoModel.findOne({ coin }).sort({ timestamp: -1 });
    if (!latestData) return res.status(404).json({ error: 'No data found for the requested coin' });

    res.json({
      price: latestData.price,
      marketCap: latestData.marketCap,
      '24hChange': latestData.change24h,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Get standard deviation of the last 100 prices
app.get('/deviation', async (req, res) => {
  const { coin } = req.query;
  if (!coin) return res.status(400).json({ error: 'Coin query param is required' });

  try {
    const data = await CryptoModel.find({ coin }).sort({ timestamp: -1 }).limit(100);
    if (data.length < 2) return res.status(400).json({ error: 'Not enough data to calculate deviation' });

    const prices = data.map((record) => record.price);
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const deviation = Math.sqrt(variance);

    res.json({ deviation: deviation.toFixed(2) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});