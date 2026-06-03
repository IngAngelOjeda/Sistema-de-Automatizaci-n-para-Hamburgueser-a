import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { initSocket } from './socket/index.js';
import ordersRouter from './routes/orders.js';
import menuRouter from './routes/menu.js';
import deliveryRouter from './routes/delivery.js';
import { initBot } from './bot/index.js';
import { botState } from './bot/state.js';

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

app.use('/api/orders', ordersRouter);
app.use('/api/menu', menuRouter);
app.use('/api/delivery', deliveryRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/bot/status', (_req, res) => res.json({ status: botState.status, qr: botState.qr }));

const io = initSocket(httpServer);
app.set('io', io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot(io);
});
