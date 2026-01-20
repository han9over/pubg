import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

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

export async function POST(req: NextRequest) {
  const { playerName, opponentName } = await req.json();

  if (!API_KEY) {
    return NextResponse.json({ error: 'PUBG API key not configured' }, { status: 500 });
  }

  if (!playerName || !opponentName) {
    return NextResponse.json({ error: 'Player names required' }, { status: 400 });
  }

  try {
    // Get player and opponent account IDs
    const playersRes = await axios.get(`${BASE_URL}/players?filter[playerNames]=${playerName},${opponentName}`, { headers });
    const playerData = playersRes.data.data.find((p: any) => p.attributes.name === playerName);
    const opponentData = playersRes.data.data.find((p: any) => p.attributes.name === opponentName);

    if (!playerData || !opponentData) {
      return NextResponse.json({ error: 'One or both players not found' }, { status: 404 });
    }

    const playerId = playerData.id;
    const opponentId = opponentData.id;

    // Get player's recent matches
    const matchIds = playerData.relationships.matches.data.map((m: any) => m.id);

    const sharedMatches: Match[] = [];

    for (const matchId of matchIds) {
      const matchRes = await axios.get(`${BASE_URL}/matches/${matchId}`, { headers });
      const matchData = matchRes.data.data;
      const included = matchRes.data.included;

      // Check if opponent is in participants
      const opponentParticipant = included.find(
        (item: any) => item.type === 'participant' && item.attributes.stats.playerId === opponentId
      );

      if (!opponentParticipant) continue;

      // Get telemetry URL
      const asset = included.find((item: any) => item.type === 'asset');
      const telemetryUrl = asset.attributes.URL;

      // Fetch telemetry
      const telemetryRes = await axios.get(telemetryUrl, { headers: { Accept: 'application/vnd.api+json' } });
      const telemetry = telemetryRes.data;

      // Filter interactions
      const interactions: Interaction[] = telemetry.filter((event: any) => {
        const isDamage = event._T === 'LogPlayerTakeDamage' &&
          ((event.attacker && event.attacker.accountId === playerId && event.victim.accountId === opponentId) ||
           (event.attacker && event.attacker.accountId === opponentId && event.victim.accountId === playerId));

        const isKnock = event._T === 'LogPlayerMakeGroggy' &&
          ((event.attacker && event.attacker.accountId === playerId && event.victim.accountId === opponentId) ||
           (event.attacker && event.attacker.accountId === opponentId && event.victim.accountId === playerId));

        const isKill = event._T === 'LogPlayerKillV2' &&
          ((event.dBNOMaker && event.dBNOMaker.accountId === playerId && event.victim.accountId === opponentId) ||
           (event.dBNOMaker && event.dBNOMaker.accountId === opponentId && event.victim.accountId === playerId) ||
           (event.finisher && event.finisher.accountId === playerId && event.victim.accountId === opponentId) ||
           (event.finisher && event.finisher.accountId === opponentId && event.victim.accountId === playerId) ||
           (event.killer && event.killer.accountId === playerId && event.victim.accountId === opponentId) ||
           (event.killer && event.killer.accountId === opponentId && event.victim.accountId === playerId));

        return isDamage || isKnock || isKill;
      }).map((event: any) => ({
        type: event._T,
        timestamp: event._D,
        details: {
          attacker: event.attacker?.name || event.dBNOMaker?.name || event.finisher?.name || event.killer?.name,
          victim: event.victim?.name,
          damage: event.damage,
          damageReason: event.damageReason,
          // Add more fields as needed
        },
      }));

      // Convert createdAt to EST
      const utcDate = new Date(matchData.attributes.createdAt);
      const estDate = utcToZonedTime(utcDate, 'America/New_York');
      const formattedDate = format(estDate, 'yyyy-MM-dd HH:mm:ss');

      sharedMatches.push({
        id: matchId,
        map: matchData.attributes.mapName,
        startedAt: formattedDate,
        interactions,
      });
    }

    return NextResponse.json({ matches: sharedMatches });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
