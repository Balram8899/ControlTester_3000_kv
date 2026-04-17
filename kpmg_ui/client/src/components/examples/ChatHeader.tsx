import ChatHeader from "../ChatHeader";

export default function ChatHeaderExample() {
  return (
    <ChatHeader
      onSettingsClick={() => console.log("Settings clicked")}
      onLogout={() => console.log("Logout clicked")}
      onClearChat={() => console.log("Clear chat clicked")}
      hasMessages={false}
    />
  );
}
