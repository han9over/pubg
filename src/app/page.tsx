'use client';

import { useState } from 'react';
import axios from 'axios';
import { format, utcToZonedTime } from 'date-fns-tz';

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
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setMatches([]);
    try {
      const response = await axios.post('/api/search', { playerName, opponentName });
      setMatches(response.data.matches);
    } catch (err) {
      setError('Error fetching data. Check console for details.');
      console.error(err);
    }
    setLoading(false);
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
      // Add more as needed
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

        {matches.length > 0 ? (
          <div className="space-y-6">
            {matches.map((match) => (
              <div key={match.id} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-semibold mb-2">Match ID: {match.id}</h2>
                <p className="mb-1">Map: {getHumanMapName(match.map)}</p>
                <p className="mb-4">Started: {match.startedAt} EST</p>
                
                <h3 className="text-xl font-medium mb-2">Interactions:</h3>
                {match.interactions.length > 0 ? (
                  <ul className="space-y-2">
                    {match.interactions.map((int, index) => (
                      <li key={index} className="bg-gray-700 p-3 rounded">
                        <p><strong>Type:</strong> {int.type}</p>
                        <p><strong>Time:</strong> {int.timestamp}</p>
                        <pre className="text-sm overflow-auto">{JSON.stringify(int.details, null, 2)}</pre>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No direct interactions found.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400">No matches found yet. Enter names and search.</p>
        )}
      </div>
    </div>
  );
}
