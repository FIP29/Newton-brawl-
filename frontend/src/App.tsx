import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { ChalkboardBackground } from './fx/ChalkboardBackground';
import { LoginScreen } from './screens/LoginScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';

/**
 * Screen flow (later phases add: character select, matchmaking, fight, victory, codex,
 * leaderboard, profile). The PixiJS backdrop is mounted once and persists across screens.
 */
export function App() {
  return (
    <>
      <ChalkboardBackground />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<RequireAuth><MainMenuScreen /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
