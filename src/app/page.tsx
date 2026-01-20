'use client';

import { useState, useEffect } from 'react';

interface Match {
  id: string;
  map: string;
  startedAt: string;
  interactions: Interaction[];
}

interface Interaction {
  type: string;
  timestamp: string;
  details: any;
}

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [matchesWithInteractions, setMatchesWithInteractions] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [waitCountdown, setWaitCountdown] = useState<number | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (waitCountdown !== null && waitCountdown > 0) {
      timer = setInterval(() => {
        setWaitCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [waitCountdown]);

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setCurrentMatch(null);
    setMatchesWithInteractions([]);
    setProgressMessage('');
    setWaitCountdown(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, opponentName }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.progress) {
              setProgressMessage(data.progress);

              // Handle wait countdown
              if (data.progress.includes('Waiting')) {
                const match = data.progress.match(/Waiting (\d+) seconds/);
                if (match && match[1]) {
                  setWaitCountdown(parseInt(match[1], 10));
                }
              } else {
                setWaitCountdown(null);
              }
            } else if (data.match) {
              const match: Match = data.match;
              setCurrentMatch(match);

              // If this match has interactions, add to persistent list
              if (match.interactions.length > 0) {
                setMatchesWithInteractions((prev) => [...prev, match]);
              }
            } else if (data.matches) {
              // Processing complete
              setCurrentMatch(null);
              setProgressMessage('Processing complete!');
              setWaitCountdown(null);
            } else if (data.error) {
              setError(data.error);
            }
          } catch (parseErr) {
            console.error('Parse error:', parseErr);
          }
        }
      }
    } catch (err) {
      setError('Error fetching data. Check console for details.');
      console.error(err);
    } finally {
      setLoading(false);
      setWaitCountdown(null);
    }
  };

  const getHumanMapName = (mapName: string) => {
    const mapNames: { [key: string]: string } = {
      Erangel_Main: 'Erangel',
      Baltic_Main: 'Erangel (Remastered)',
      Desert_Main: 'Miramar',
      Savage_Main: 'Sanhok',
      DihorOtok_Main: 'Vikendi',
      Summerland_Main: 'Karakin',
      Param_Main: 'Paramo',
      Tiger_Main: 'Taego',
      Chimera_Main: 'Haven',
      Kiki_Main: 'Deston',
      Neon_Main: 'Rondo',
    };
    return mapNames[mapName] || mapName;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">PUBG Match Interaction Finder</h1>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Your Player Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="bg-gray-700 border border-gray-600 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Opponent Player Name"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              className="bg-gray-700 border border-gray-600 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition duration-300 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search Matches'}
          </button>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {/* Progress / Countdown */}
        {(progressMessage || waitCountdown !== null) && (
          <div className="bg-gray-800 p-4 rounded-lg mb-6 text-center">
            <p className="text-lg font-medium">
              {waitCountdown !== null
                ? `Waiting ${waitCountdown} seconds for PUBG API rate limit...`
                : progressMessage}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Note: PUBG API limits to 10 requests per minute.
            </p>
          </div>
        )}

        {/* Current Processing Match */}
        {currentMatch && (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8 animate-fade-in">
            <h2 className="text-2xl font-semibold mb-4">Current Match: {currentMatch.id}</h2>
            <p className="mb-2">Map: {getHumanMapName(currentMatch.map)}</p>
            <p className="mb-4">Started: {currentMatch.startedAt} EST</p>

            <h3 className="text-xl font-medium mb-3">Interactions:</h3>
            {currentMatch.interactions.length > 0 ? (
              <ul className="space-y-3">
                {currentMatch.interactions.map((int, index) => (
                  <li key={index} className="bg-gray-700 p-4 rounded">
                    <p className="font-semibold">{int.type.replace('Log', '')}</p>
                    <p className="text-sm text-gray-300">Time: {int.timestamp}</p>
                    <pre className="text-xs bg-gray-900 p-3 rounded mt-2 overflow-auto">
                      {JSON.stringify(int.details, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">No direct interactions found in this match.</p>
            )}
          </div>
        )}

        {/* Persistent Matches with Interactions */}
        {matchesWithInteractions.length > 0 && (
          <div className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center text-green-400">Matches with Interactions</h2>
            <div className="space-y-8">
              {matchesWithInteractions.map((match) => (
                <div
                  key={match.id}
                  className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 rounded-xl shadow-2xl border border-green-500/40"
                >
                  <h3 className="text-2xl font-semibold mb-4">Match ID: {match.id}</h3>
                  <p className="mb-2">Map: <span className="font-medium">{getHumanMapName(match.map)}</span></p>
                  <p className="mb-6">Started: <span className="font-medium">{match.startedAt} EST</span></p>

                  <h4 className="text-xl font-medium mb-4 text-green-300">Interactions:</h4>
                  <ul className="space-y-4">
                    {match.interactions.map((int, index) => (
                      <li key={index} className="bg-gray-700/70 p-4 rounded-lg border border-gray-600">
                        <p className="font-bold text-lg">{int.type.replace('Log', '')}</p>
                        <p className="text-sm text-gray-300 mt-1">Time: {int.timestamp}</p>
                        <pre className="text-sm bg-gray-900 p-3 rounded mt-2 overflow-auto">
                          {JSON.stringify(int.details, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !currentMatch && matchesWithInteractions.length === 0 && progressMessage === '' && (
          <p className="text-center text-gray-400 mt-8">Enter player names and search to find matches.</p>
        )}
      </div>
    </div>
  );
}
