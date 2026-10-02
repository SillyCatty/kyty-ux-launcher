import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useApp } from "./store/app";
import { Ambient, Sidebar, TitleBar, Toasts } from "./components/Chrome";
import { SaveDiffModal } from "./components/SaveDiffModal";
import { LibraryView } from "./views/Library";
import { SettingsView } from "./views/Settings";
import { SetupView } from "./views/Setup";
import { UpdatesView } from "./views/Updates";

function Splash() {
  return (
    <motion.div key="splash" exit={{ opacity: 0 }} className="grid h-full place-items-center">
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        className="h-4 w-4 rounded-full bg-gradient-to-br from-accent to-accent-2"
      />
    </motion.div>
  );
}

export default function App() {
  const { boot, view, init, diffOpen } = useApp();
  useEffect(() => void init(), [init]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-full flex-col">
        <Ambient />
        <TitleBar />
        <div className="relative z-10 flex min-h-0 flex-1">
          {boot === "ready" && <Sidebar />}
          <main className="relative min-w-0 flex-1">
            <AnimatePresence mode="wait">
              {boot === "loading" && <Splash />}
              {boot === "setup" && <SetupView key="setup" />}
              {boot === "ready" && view === "library" && <LibraryView key="library" />}
              {boot === "ready" && view === "settings" && <SettingsView key="settings" />}
              {boot === "ready" && view === "updates" && <UpdatesView key="updates" />}
            </AnimatePresence>
          </main>
        </div>
        <AnimatePresence>{diffOpen && <SaveDiffModal key="diff" />}</AnimatePresence>
        <Toasts />
      </div>
    </MotionConfig>
  );
}
