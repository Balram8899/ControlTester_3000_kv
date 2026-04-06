import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useChatContext } from "@/hooks/useChatContext";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { Button } from "@/components/ui/button";
import { Trash2, MessageSquare } from "lucide-react";
import type { Message } from "@/types";

export default function ChatPage() {
  const { 
    messages, 
    setMessages, 
    uploadedFiles, 
    setUploadedFiles, 
    hasAttachments, 
    setHasAttachments,
    clearChat 
  } = useChatContext();
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const { toast } = useToast();

  const uploadFilesMutation = useMutation({
    mutationFn: async ({ files, selected_model }: { files: File[]; selected_model: string }) => {
      const formData = new FormData();
      formData.append("selected_model", selected_model);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "chat");

      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/build-knowledge-base`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      try {
        const saveFormData = new URLSearchParams();
        saveFormData.append("kb_type", "chat");
        saveFormData.append("dir_path", "chat_attachment_vectorstore");

        await fetch(`/api/save-vectorstore`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: saveFormData.toString(),
        });
      } catch (saveError) {
        console.warn("Error saving chat vectorstore:", saveError);
      }
      
      return result;
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({ 
      user_input, 
      selected_model, 
      has_attachments, 
      chat_history 
    }: { 
      user_input: string; 
      selected_model: string; 
      has_attachments: boolean;
      chat_history: Array<{role: string; content: string}>;
    }) => {
      const payload: any = {
        selected_model,
        user_input,
        chat_history,
        global_kb_path: "saved_global_vectorstore",
        company_kb_path: "saved_company_vectorstore",
      };
      
      if (has_attachments) {
        payload.chat_kb_path = "chat_attachment_vectorstore";
      }

      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get chat response");
      }

      return await response.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Chat Error",
        description: error.message || "Failed to get response from AI",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = async (content: string) => {
    const messageAttachments = uploadedFiles.length > 0
      ? uploadedFiles.map(file => ({ name: file.name, size: file.size }))
      : undefined;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      attachments: messageAttachments,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Get selected model from localStorage
    const selectedModel = localStorage.getItem("selectedModel");
    
    if (!selectedModel) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "⚠️ Please select a model in Settings first.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast({
        title: "No Model Selected",
        description: "Please go to Settings and select a model first.",
        variant: "destructive",
      });
      return;
    }

    // Track if we have attachments for this message
    let currentHasAttachments = hasAttachments;

    // Process uploaded files if any
    if (uploadedFiles.length > 0 && !hasAttachments) {
      setIsProcessingFiles(true);
      try {
        const uploadResult = await uploadFilesMutation.mutateAsync({
          files: uploadedFiles,
          selected_model: selectedModel,
        });

        setHasAttachments(true);
        currentHasAttachments = true; // Update local variable immediately
        
        const stats = uploadResult?.processing_summary;
        const statsMessage = stats 
          ? `Files: ${stats.files} | Vectors: ${stats.vectors || 'N/A'} | Time: ${stats.processing_seconds?.toFixed(2)}s | Model: ${stats.model}`
          : `Successfully uploaded files`;
        
        toast({
          title: "✓ Chat Attachments Ready",
          description: statsMessage,
          className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
        });
      } catch (error) {
        toast({
          title: "File Upload Failed",
          description: error instanceof Error ? error.message : "Failed to process files",
          variant: "destructive",
        });
        setIsProcessingFiles(false);
        return;
      } finally {
        setIsProcessingFiles(false);
      }
    }

    // Load all vectorstores into memory before chat
    const loadVectorstore = async (dir_path: string, kb_type: string) => {
      const formData = new URLSearchParams();
      formData.append("dir_path", dir_path);
      formData.append("kb_type", kb_type);
      formData.append("model_name", selectedModel);

      const response = await fetch(`/api/load-vectorstore`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (!response.ok) {
        console.warn(`Failed to load ${kb_type} vectorstore from ${dir_path}`);
      }
    };

    try {
      const loads = [
        loadVectorstore("saved_global_vectorstore", "global"),
        loadVectorstore("saved_company_vectorstore", "company"),
      ];
      
      if (currentHasAttachments) {
        loads.push(loadVectorstore("chat_attachment_vectorstore", "chat"));
      }
      
      await Promise.allSettled(loads);
    } catch (error) {
      console.log("Vectorstore loading info:", error);
    }

    // Prepare chat history (exclude loading messages and error messages)
    const chatHistory = messages
      .filter(msg => msg.content !== "loading" && !msg.content.startsWith("⚠️") && !msg.content.startsWith("❌"))
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    // Add loading message
    const loadingMessageId = (Date.now() + 1).toString();
    const loadingMessage: Message = {
      id: loadingMessageId,
      role: "assistant",
      content: "loading",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const response = await chatMutation.mutateAsync({
        user_input: content,
        selected_model: selectedModel,
        has_attachments: currentHasAttachments,
        chat_history: chatHistory,
      });

      // Replace loading message with actual response
      const aiMessage: Message = {
        id: loadingMessageId,
        role: "assistant",
        content: response.response || "No response received",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => prev.map(msg => msg.id === loadingMessageId ? aiMessage : msg));

      // Clear uploaded files after successful response (attachments are one-time use per message)
      setUploadedFiles([]);
      setHasAttachments(false);
    } catch (error) {
      // Replace loading message with error message
      const errorMessage: Message = {
        id: loadingMessageId,
        role: "assistant",
        content: "❌ Failed to get response. Please ensure the FastAPI backend is running.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => prev.map(msg => msg.id === loadingMessageId ? errorMessage : msg));
    }
  };

  const handleClearChat = () => {
    clearChat();
    toast({
      title: "Chat Cleared",
      description: "All messages and files have been cleared",
      className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    });
  };

  // Shared ChatInput props to reduce duplication
  const chatInputProps = {
    onSendMessage: handleSendMessage,
    onFileSelect: (files: File[]) => setUploadedFiles((prev) => [...prev, ...files]),
    disabled: chatMutation.isPending || isProcessingFiles,
    files: uploadedFiles,
    onRemoveFile: (index: number) => {
      setUploadedFiles((prev) => {
        const newFiles = prev.filter((_, i) => i !== index);
        // Update attachment status based on new array length
        if (newFiles.length === 0) {
          setHasAttachments(false);
        }
        return newFiles;
      });
    },
    onClearAllFiles: () => {
      setUploadedFiles([]);
      setHasAttachments(false);
    },
    isProcessing: isProcessingFiles,
    hasVectorstore: hasAttachments,
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, hsl(262 80% 20% / 0.4), hsl(217 91% 20% / 0.3))", borderBottom: "1px solid hsl(217 91% 55% / 0.2)" }}>
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-base font-bold text-foreground">AI Chat</h1>
            <p className="text-xs text-muted-foreground">Converse with your AI cybersecurity audit assistant</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            data-testid="button-clear-chat"
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Chat
          </Button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-3xl space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-semibold text-foreground">
                What can I help you with?
              </h2>
              <p className="text-muted-foreground">
                Ask me anything, upload documents, or explore the power of AI-driven conversations
              </p>
            </div>

            <ChatInput {...chatInputProps} />
          </div>
        </div>
      ) : (
        <>
          <ChatMessages messages={messages} />

          <ChatInput {...chatInputProps} />
        </>
      )}
    </div>
  );
}
