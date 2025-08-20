import { env } from './config/env';
import app from './app';
import { startOverdueCron } from './jobs/overdue.job';

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
  startOverdueCron();
});