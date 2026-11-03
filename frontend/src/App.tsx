import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { ChalkboardBackground } from './fx/ChalkboardBackground';
import { LoginScreen } from './screens/LoginScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { PlayOnlineScreen } from './screens/PlayOnlineScreen';
import { FightScreen } from './screens/FightScreen';
import { LocalVersusScreen } from './screens/LocalVersusScreen';
import { CodexScreen } from './screens/CodexScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CharacterPreview } from './dev/CharacterPreview';

/**
 * Screen flow: Login → Main menu → Play Online (queues / room code) → Fight → Victory + Lab Note;
 * Local Versus (offline); Codex; Leaderboard; Profile.
 * Later phases add character select, victory/Lab Note, codex, leaderboard and profile.
 * The animated menu backdrop is paused during fights so the GPU is free for the match.
 */
export function App() {
  const path = useLocation().pathname;
  const inFight = path.startsWith('/fight') || path === '/local' || path.startsWith('/dev');
  return (
    <>
      {!inFight && <ChalkboardBackground />}
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<RequireAuth><MainMenuScreen /></RequireAuth>} />
        <Route path="/play" element={<RequireAuth><PlayOnlineScreen /></RequireAuth>} />
        <Route path="/fight/:code" element={<RequireAuth><FightScreen /></RequireAuth>} />
        <Route path="/local" element={<RequireAuth><LocalVersusScreen /></RequireAuth>} />
        <Route path="/codex" element={<RequireAuth><CodexScreen /></RequireAuth>} />
        <Route path="/leaderboard" element={<RequireAuth><LeaderboardScreen /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfileScreen /></RequireAuth>} />
        {import.meta.env.DEV && <Route path="/dev/characters" element={<CharacterPreview />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
