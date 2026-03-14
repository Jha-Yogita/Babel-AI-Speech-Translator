

from datetime import datetime
from collections import defaultdict


class ConversationManager:
    def __init__(self, max_turns_per_session: int = 50):
        self._sessions: dict[str, list] = defaultdict(list)
        self.max_turns = max_turns_per_session

    def add_turn(
        self,
        session_id: str,
        original: str,
        translated: str,
        source_lang: str,
        target_lang: str
    ):
        turn = {
            "turn": len(self._sessions[session_id]) + 1,
            "timestamp": datetime.now().isoformat(),
            "original": original,
            "translated": translated,
            "source_lang": source_lang,
            "target_lang": target_lang,
        }
        self._sessions[session_id].append(turn)

        # Trim if exceeds max
        if len(self._sessions[session_id]) > self.max_turns:
            self._sessions[session_id] = self._sessions[session_id][-self.max_turns:]

    def get_context(self, session_id: str, last_n: int = 6) -> list:
        """Return last N turns for LLM context."""
        return self._sessions[session_id][-last_n:]

    def get_history(self, session_id: str) -> list:
        """Return full history for a session."""
        return list(self._sessions[session_id])

    def get_turn_count(self, session_id: str) -> int:
        return len(self._sessions[session_id])

    def clear(self, session_id: str):
        self._sessions[session_id] = []

    def get_all_sessions(self) -> list:
        return list(self._sessions.keys())