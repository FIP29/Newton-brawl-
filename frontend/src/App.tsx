import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { ChalkboardBackground } from './fx/ChalkboardBackground';
import { LoginScreen } from './screens/LoginScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { PlayOnlineScreen } from './screens/PlayOnlineScreen';
import { FightScreen } from './screens/FightScreen';

/**
 * Screen flow: Login → Main menu → Play Online (room code) → Fight.
 * Later phases add character select, victory/Lab Note, codex, leaderboard and profile.
 * The animated menu backdrop is paused during fights so the GPU is free for the match.
 */
export function App() {
  const inFight = useLocation().pathname.startsWith('/fight');
  return (
    <>
      {!inFight && <ChalkboardBackground />}
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<RequireAuth><MainMenuScreen /></RequireAuth>} />
        <Route path="/play" element={<RequireAuth><PlayOnlineScreen /></RequireAuth>} />
        <Route path="/fight/:code" element={<RequireAuth><FightScreen /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
