import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const API_KEY = process.env.PUBG_API_KEY;
const SHARD = process.env.SHARD || 'steam';
const BASE_URL = `https://api.pubg.com/shards/${SHARD}`;

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/vnd.api+json',
};

interface Interaction {
  type: string;
  timestamp: string;
  details: any;
}

interface Match {
  id: string;
  map: string;
  startedAt: string;
  interactions: Interaction[];
}

// Rate limit: 10 requests per 60 seconds
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
let requestTimestamps: number[] = [];

function enforceRateLimit() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_WINDOW_MS);
  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldest = requestTimestamps[0];
    const waitTime = RATE_WINDOW_MS - (now - oldest);
    return waitTime;
  }
  requestTimestamps.push(now);
  return 0;
}

async function rateLimitedAxiosGet(url: string, config: any) {
  const waitTime = enforceRateLimit();
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  return axios.get(url, config);
}

export async function POST(req: NextRequest) {
  const { playerName, opponentName } = await req.json();

  if (!API_KEY) {
    return NextResponse.json({ error: 'PUBG API key not configured' }, { status: 500 });
  }

  if (!playerName || !opponentName) {
    return NextResponse.json({ error: 'Player names required' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      function enqueue(message: any) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(message) + '\n'));
      }

      try {
        enqueue({ progress: 'Fetching player data...' });

        // Get player and opponent account IDs (1 request)
        const playersRes = await rateLimitedAxiosGet(
          `${BASE_URL}/players?filter[playerNames]=${encodeURIComponent(playerName)},${encodeURIComponent(opponentName)}`,
          { headers }
        );
        const playerData = playersRes.data.data.find((p: any) => p.attributes.name.toLowerCase() === playerName.toLowerCase());
        const opponentData = playersRes.data.data.find((p: any) => p.attributes.name.toLowerCase() === opponentName.toLowerCase());

        if (!playerData || !opponentData) {
          enqueue({ error: 'One or both players not found' });
          controller.close();
          return;
        }

        const playerId = playerData.id;
        const opponentId = opponentData.id;

        // Get player's recent matches
        const matchIds = playerData.relationships.matches.data.map((m: any) => m.id);
        enqueue({ progress: `Found ${matchIds.length} recent matches. Checking for shared matches...` });

        let processedCount = 0;

        for (let i = 0; i < matchIds.length; i++) {
          const matchId = matchIds[i];
          processedCount++;
          enqueue({ progress: `Processing match ${processedCount}/${matchIds.length} (ID: ${matchId})...` });

          // Fetch match details (1 request)
          const matchRes = await rateLimitedAxiosGet(`${BASE_URL}/matches/${matchId}`, { headers });
          const matchData = matchRes.data.data;
          const included = matchRes.data.included;

          // Check if opponent is in participants
          const opponentParticipant = included.find(
            (item: any) => item.type === 'participant' && item.attributes.stats.playerId === opponentId
          );

          if (!opponentParticipant) {
            enqueue({ progress: `Opponent not in match ${processedCount}/${matchIds.length}. Skipping.` });
            continue;
          }

          // Get telemetry URL
          const asset = included.find((item: any) => item.type === 'asset');
          if (!asset) {
            enqueue({ progress: `No telemetry available for match ${processedCount}/${matchIds.length}. Skipping.` });
            continue;
          }
          const telemetryUrl = asset.attributes.URL;

          // Fetch telemetry (1 request)
          enqueue({ progress: `Fetching telemetry for match ${processedCount}/${matchIds.length}...` });
          const telemetryRes = await rateLimitedAxiosGet(telemetryUrl, { headers: { Accept: 'application/vnd.api+json' } });
          const telemetry = telemetryRes.data;

          // Filter interactions
          const interactions: Interaction[] = telemetry.filter((event: any) => {
            const isDamage = event._T === 'LogPlayerTakeDamage' &&
              ((event.attacker?.accountId === playerId && event.victim?.accountId === opponentId) ||
               (event.attacker?.accountId === opponentId && event.victim?.accountId === playerId));

            const isKnock = event._T === 'LogPlayerMakeGroggy' &&
              ((event.attacker?.accountId === playerId && event.victim?.accountId === opponentId) ||
               (event.attacker?.accountId === opponentId && event.victim?.accountId === playerId));

            const isKill = event._T === 'LogPlayerKillV2' &&
              ((event.dBNOMaker?.accountId === playerId && event.victim?.accountId === opponentId) ||
               (event.dBNOMaker?.accountId === opponentId && event.victim?.accountId === playerId) ||
               (event.finisher?.accountId === playerId && event.victim?.accountId === opponentId) ||
               (event.finisher?.accountId === opponentId && event.victim?.accountId === playerId) ||
               (event.killer?.accountId === playerId && event.victim?.accountId === opponentId) ||
               (event.killer?.accountId === opponentId && event.victim?.accountId === playerId));

            return isDamage || isKnock || isKill;
          }).map((event: any) => ({
            type: event._T,
            timestamp: event._D,
            details: {
              attacker: event.attacker?.name || event.dBNOMaker?.name || event.finisher?.name || event.killer?.name,
              victim: event.victim?.name,
              damage: event.damage,
              damageReason: event.damageReason,
            },
          }));

          // Convert createdAt (UTC) to EST
          const utcDate = new Date(matchData.attributes.createdAt);
          const estDate = toZonedTime(utcDate, 'America/New_York');
          const formattedDate = format(estDate, 'yyyy-MM-dd HH:mm:ss');

          const matchResult = {
            id: matchId,
            map: matchData.attributes.mapName,
            startedAt: formattedDate,
            interactions,
          };

          // Send this match immediately to the frontend
          enqueue({ match: matchResult });

          enqueue({ progress: `Completed match ${processedCount}/${matchIds.length}. Found ${interactions.length} interactions.` });
        }

        // Final completion signal
        enqueue({ progress: 'Processing complete!' });
        enqueue({ matches: [] }); // Empty array just to trigger the final handling
        controller.close();
      } catch (error: any) {
        console.error(error);
        enqueue({ error: error.response?.data?.errors?.[0]?.detail || 'Failed to fetch data. Check console for details.' });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
