import { X } from "lucide-react";

interface UserSettingsProps {
  showSettings: boolean;
  editingUsername: string;
  editingNametag: string;
  shareActivity: boolean;
  participationPending: boolean;
  onClose: () => void;
  onUsernameChange: (value: string) => void;
  onNametagChange: (value: string) => void;
  onSaveProfile: () => void;
  onSetRecommendationParticipation: (enabled: boolean) => void;
}

export default function UserSettings({
  showSettings,
  editingUsername,
  editingNametag,
  shareActivity,
  participationPending,
  onClose,
  onUsernameChange,
  onNametagChange,
  onSaveProfile,
  onSetRecommendationParticipation,
}: UserSettingsProps) {
  if (!showSettings) return null;

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-header">
          <h3>Settings</h3>
          <button type="button" className="close-chat" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <h4>Profile</h4>
            <label>
              <span>Username (unique)</span>
              <input
                type="text"
                value={editingUsername}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="Username"
                maxLength={30}
              />
            </label>
            <label>
              <span>Nametag (shown in chats)</span>
              <input
                type="text"
                value={editingNametag}
                onChange={(e) => onNametagChange(e.target.value)}
                placeholder="Nametag"
                maxLength={30}
              />
            </label>
            <button
              type="button"
              className="submit-community"
              onClick={onSaveProfile}
              disabled={!editingUsername.trim() || !editingNametag.trim()}
            >
              Save profile
            </button>
          </div>
          <div className="settings-section">
            <h4>Privacy</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={shareActivity}
                disabled={participationPending}
                onChange={(event) => onSetRecommendationParticipation(event.target.checked)}
              />
              <span>
                Let my favorites and watched/read list help recommend stories to similar members.
                You can change this any time; it does not affect your own recommendations.
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
