import express from 'express';
import { isFailure, successValue } from '../helpers/result';
import { ssm } from '../helpers/ssm';
import { getStreamResponse } from '../handlers/mux/getStreamResponse';
import { makeGetStreamStateFromSSMAndMux } from '../handlers/mux/makeGetStreamStateFromSSMAndMux';
import { getRoomsFromSSM } from '../handlers/rooms/getRoomsFromSSM';

const encodedParameters = process.env.LOCAL_SSM_PARAMETERS;
if (!encodedParameters) {
  throw new Error('LOCAL_SSM_PARAMETERS is not set; copy .env.example to .env and configure the local rooms');
}

const getStreamState = makeGetStreamStateFromSSMAndMux(ssm);
const app = express();

app.get('/api/stream', async (_request, response) => {
  try {
    const result = await getRoomsFromSSM();
    if (isFailure(result)) {
      response.status(500).json({ ok: false, error: result.value.message });
      return;
    }
    response.setHeader('Cache-Control', 'no-cache');
    response.json({ ok: true, rooms: successValue(result) });
  } catch (error) {
    response.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.get('/api/stream/:roomId', async (request, response) => {
  try {
    const result = await getStreamState(request.params.roomId);
    if (isFailure(result)) {
      response.status(404).json({ ok: false, error: 'Not found' });
      return;
    }
    response.setHeader('Cache-Control', 'no-cache');
    response.json(getStreamResponse(successValue(result)));
  } catch (error) {
    response.status(500).json({ ok: false, error: (error as Error).message });
  }
});

const port = Number.parseInt(process.env.LOCAL_API_PORT || '8080', 10);
app.listen(port, '127.0.0.1', () => {
  console.log(`Local SSM-backed API listening on http://127.0.0.1:${port}`);
});
