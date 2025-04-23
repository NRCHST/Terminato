import { useEffect, useRef, useState } from "react";

type ConsoleEntryType = "input" | "error" | "success" | "system" | "json" | "default";

interface ConsoleEntry {
  text: string;
  type: ConsoleEntryType;
}

interface Command {
  description: string;
  usage: string;
  details?: string;
  handler: (args: string[]) => void;
}

export default function Home() {
  const [currentMode, setCurrentMode] = useState<"TEST" | "LIVE">("TEST");
  const [baseUrl, setBaseUrl] = useState("https://ordinals.com");
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    { text: "Welcome to Termina (test build)! Type HELP to see your options.", type: "system" }
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Keep the console scrolled to the bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleEntries]);
  
  // Focus the input when the component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
  // Append text to the console
  const appendToConsole = (text: string, type: ConsoleEntryType = "default") => {
    setConsoleEntries(prev => [...prev, { text, type }]);
  };
  
  // Escape HTML to prevent XSS
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
  
  // Format JSON with syntax highlighting
  const formatJsonOutput = (jsonString: string): string => {
    return escapeHtml(jsonString)
      .replace(/(".*?")/g, '<span class="text-blue-400">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="text-red-400">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="text-green-400">$1</span>');
  };
  
  // Handle command input
  const handleCommandInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) {
      const command = inputValue.trim();
      
      if (command) {
        // Add to history
        setCommandHistory(prev => [command, ...prev]);
        setHistoryIndex(-1);
        
        // Display command
        appendToConsole(command, "input");
        
        // Process command
        processCommand(command);
        
        // Clear input
        setInputValue('');
      }
    } 
    // Command history navigation (up/down arrows)
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  };
  
  // Command handlers
  const handleHelp = (args: string[]) => {
    if (args.length === 0) {
      appendToConsole("For more information on a specific command, type HELP command-name. Your options are:", "system");
      
      // Configuration section with different color
      appendToConsole("Configuration:", "success");
      appendToConsole("MODE - Switch between TEST and LIVE mode", "default");
      appendToConsole("CLEAR - Clear the console", "default");
      appendToConsole("", "default");
      
      // Ordinals section with different color
      appendToConsole("Ordinals Recursive Endpoints:", "success");
      appendToConsole("BLOCK - Retrieve block information", "default");
      appendToConsole("INSCRIPTION - Query inscription data", "default");
      appendToConsole("SAT - Get information about specific satoshis", "default");
      appendToConsole("TRANSACTION - Query transaction data", "default");
      appendToConsole("UTXO - View UTXO information", "default");
    } else {
      const commandName = args[0].toUpperCase();
      if (commandName in commands) {
        const command = commands[commandName as keyof typeof commands];
        appendToConsole(`${commandName} - ${command.description}`, "system");
        appendToConsole(`Usage: ${command.usage}`, "default");
        if (command.details) {
          appendToConsole(command.details, "default");
        }
      } else {
        appendToConsole(`No help available for '${commandName}'. Type HELP to see available commands.`, "error");
      }
    }
  };
  
  const handleMode = (args: string[]) => {
    if (args.length === 0) {
      appendToConsole(`Current mode: ${currentMode}`, "success");
      return;
    }
    
    const mode = args[0].toUpperCase();
    if (mode === "TEST") {
      setCurrentMode("TEST");
      setBaseUrl("https://ordinals.com");
      appendToConsole("Switched to TEST mode. Using https://ordinals.com prefix.", "success");
    } else if (mode === "LIVE") {
      setCurrentMode("LIVE");
      setBaseUrl("");
      appendToConsole("Switched to LIVE mode. Using no prefix.", "success");
    } else {
      appendToConsole(`Invalid mode: ${mode}. Available modes: TEST, LIVE`, "error");
    }
  };
  
  const handleBlock = async (args: string[]) => {
    setIsProcessing(true);
    
    try {
      let url;
      let response;
      let data;
      
      // Determine if this is a LATEST request or a specific block hash/height
      if (args.length === 0 || args[0].toUpperCase() === "LATEST") {
        // Get the latest block info
        url = `${baseUrl}/r/blockinfo/$(${baseUrl}/r/blockheight)`;
        response = await fetch(`${baseUrl}/r/blockheight`);
        const height = await response.text();
        url = `${baseUrl}/r/blockinfo/${height}`;
        response = await fetch(url);
        data = await response.json();
        appendToConsole(JSON.stringify(data, null, 2), "json");
      } else {
        // Handle block by hash or height
        const blockId = args[0]; // Could be a hash or height
        url = `${baseUrl}/r/blockinfo/${blockId}`;
        response = await fetch(url);
        data = await response.json();
        appendToConsole(JSON.stringify(data, null, 2), "json");
      }
    } catch (error) {
      if (error instanceof Error) {
        appendToConsole(`Error: ${error.message}`, "error");
      } else {
        appendToConsole("An unknown error occurred", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleInscription = async (args: string[]) => {
    if (args.length === 0) {
      appendToConsole("Please specify an inscription ID. Type HELP INSCRIPTION for options.", "error");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // First argument is always the inscription ID
      const inscriptionId = args[0];
      
      // Second argument is the optional subcommand
      let subcommand = args.length > 1 ? args[1].toUpperCase() : "ALL";
      
      let url;
      let response;
      let data;
      let contentUrl;
      
      switch (subcommand) {
        case "ALL":
          // Return all available information
          appendToConsole(`Retrieving all information for inscription ${inscriptionId}:`, "system");
          
          // Get inscription info
          url = `${baseUrl}/r/inscription/${inscriptionId}`;
          try {
            response = await fetch(url);
            if (response.ok) {
              data = await response.json();
              appendToConsole("INFO:", "success");
              appendToConsole(JSON.stringify(data, null, 2), "json");
            }
          } catch (error) {
            appendToConsole(`Error fetching INFO: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
          }
          
          // Get content link
          contentUrl = `${baseUrl}/content/${inscriptionId}`;
          appendToConsole("CONTENT:", "success");
          appendToConsole(`To view content, visit: ${contentUrl}`, "default");
          
          // Get metadata if available
          try {
            url = `${baseUrl}/r/inscription/${inscriptionId}/metadata`;
            response = await fetch(url);
            if (response.ok) {
              // First try to get metadata as JSON
              const text = await response.text();
              if (!text || text.trim() === "") {
                appendToConsole("METADATA: No metadata available for this inscription", "system");
              } else {
                appendToConsole("METADATA:", "success");
                try {
                  // Try to parse as JSON first
                  const jsonData = JSON.parse(text);
                  appendToConsole(JSON.stringify(jsonData, null, 2), "json");
                } catch (parseError) {
                  // If not JSON, just display the raw text
                  appendToConsole(text, "default");
                }
              }
            } else {
              appendToConsole("METADATA: No metadata available for this inscription", "system");
            }
          } catch (error) {
            appendToConsole(`Error fetching METADATA: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
          }
          break;
          
        case "CONTENT":
          url = `${baseUrl}/content/${inscriptionId}`;
          appendToConsole(`Retrieving content from: ${url}`, "default");
          appendToConsole(`To view content, visit: ${url}`, "success");
          break;
          
        case "UNDELEGATED":
          // Assuming this is a separate endpoint for undelegated content
          url = `${baseUrl}/content/${inscriptionId}?undelegated=true`;
          appendToConsole(`Retrieving undelegated content from: ${url}`, "default");
          appendToConsole(`To view undelegated content, visit: ${url}`, "success");
          break;
          
        case "INFO":
          url = `${baseUrl}/r/inscription/${inscriptionId}`;
          response = await fetch(url);
          data = await response.json();
          appendToConsole(JSON.stringify(data, null, 2), "json");
          break;
          
        case "METADATA":
          url = `${baseUrl}/r/inscription/${inscriptionId}/metadata`;
          response = await fetch(url);
          
          if (response.ok) {
            // Get the text content of the metadata
            const text = await response.text();
            if (!text || text.trim() === "") {
              appendToConsole("No metadata available for this inscription", "system");
            } else {
              appendToConsole("METADATA:", "success");
              try {
                // Try to parse as JSON first
                const jsonData = JSON.parse(text);
                appendToConsole(JSON.stringify(jsonData, null, 2), "json");
              } catch (parseError) {
                // If not JSON, just display the raw text
                appendToConsole(text, "default");
              }
            }
          } else {
            appendToConsole("No metadata available for this inscription", "system");
          }
          break;
          
        case "PARENTS":
          url = `${baseUrl}/r/parents/${inscriptionId}`;
          response = await fetch(url);
          data = await response.json();
          appendToConsole(JSON.stringify(data, null, 2), "json");
          break;
          
        case "CHILDREN":
          url = `${baseUrl}/r/children/${inscriptionId}`;
          response = await fetch(url);
          data = await response.json();
          appendToConsole(JSON.stringify(data, null, 2), "json");
          break;
          
        default:
          appendToConsole(`Unknown INSCRIPTION subcommand: ${subcommand}. Type HELP INSCRIPTION for options.`, "error");
      }
    } catch (error) {
      if (error instanceof Error) {
        appendToConsole(`Error: ${error.message}`, "error");
      } else {
        appendToConsole("An unknown error occurred", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleSat = async (args: string[]) => {
    if (args.length === 0) {
      appendToConsole("Please specify a satoshi number. Type HELP SAT for options.", "error");
      return;
    }
    
    const satNumber = args[0];
    setIsProcessing(true);
    
    try {
      const url = `${baseUrl}/r/sat/${satNumber}`;
      const response = await fetch(url);
      const data = await response.json();
      appendToConsole(JSON.stringify(data, null, 2), "json");
    } catch (error) {
      if (error instanceof Error) {
        appendToConsole(`Error: ${error.message}`, "error");
      } else {
        appendToConsole("An unknown error occurred", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleTransaction = async (args: string[]) => {
    if (args.length === 0) {
      appendToConsole("Please specify a transaction ID. Type HELP TRANSACTION for options.", "error");
      return;
    }
    
    const txid = args[0];
    setIsProcessing(true);
    
    try {
      const url = `${baseUrl}/r/tx/${txid}`;
      const response = await fetch(url);
      const data = await response.json();
      appendToConsole(JSON.stringify(data, null, 2), "json");
    } catch (error) {
      if (error instanceof Error) {
        appendToConsole(`Error: ${error.message}`, "error");
      } else {
        appendToConsole("An unknown error occurred", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleUtxo = async (args: string[]) => {
    if (args.length === 0) {
      appendToConsole("Please specify a UTXO in the format txid:vout. Type HELP UTXO for options.", "error");
      return;
    }
    
    const utxoParam = args[0];
    setIsProcessing(true);
    
    try {
      const url = `${baseUrl}/r/utxo/${utxoParam}`;
      appendToConsole(`Fetching UTXO information from: ${url}`, "default");
      
      const response = await fetch(url);
      
      // Check if the response is ok before trying to parse JSON
      if (!response.ok) {
        appendToConsole(`Error: Server responded with status ${response.status}`, "error");
        if (response.status === 404) {
          appendToConsole("UTXO not found", "error");
        }
        return;
      }
      
      // Check the response text before parsing to avoid JSON errors
      const text = await response.text();
      if (!text || text.trim() === "") {
        appendToConsole("No information found for this UTXO", "default");
        return;
      }
      
      try {
        const data = JSON.parse(text);
        appendToConsole(JSON.stringify(data, null, 2), "json");
      } catch (parseError) {
        appendToConsole(`Could not parse response as JSON: ${text}`, "error");
      }
    } catch (error) {
      if (error instanceof Error) {
        appendToConsole(`Error: ${error.message}`, "error");
      } else {
        appendToConsole("An unknown error occurred", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleClear = () => {
    setConsoleEntries([]);
    appendToConsole("Console cleared.", "system");
  };
  
  // Command definitions
  const commands: Record<string, Command> = {
    HELP: {
      description: "Displays help information for available commands.",
      usage: "HELP [command]",
      handler: handleHelp
    },
    MODE: {
      description: "Switch between TEST and LIVE mode.",
      usage: "MODE [TEST|LIVE]",
      details: "MODE TEST : switches to TEST mode, with https://ordinals.com prefix for recursive endpoints\nMODE LIVE : switches to LIVE mode, without https://ordinals.com prefix for recursive endpoints",
      handler: handleMode
    },
    BLOCK: {
      description: "Retrieve block information.",
      usage: "BLOCK [LATEST|<hash or height>]",
      details: "BLOCK LATEST : get latest block info\nBLOCK {hash/height} : get block info at specified HASH or HEIGHT",
      handler: handleBlock
    },
    INSCRIPTION: {
      description: "Query inscription data.",
      usage: "INSCRIPTION <inscription_id> [ALL|CONTENT|UNDELEGATED|INFO|METADATA|PARENTS|CHILDREN]",
      details: "INSCRIPTION <inscription_id> : This is the main command, resolves ALL by default\nINSCRIPTION <inscription_id> ALL : Returns content, info, metadata\nINSCRIPTION <inscription_id> CONTENT : Return content only of inscription\nINSCRIPTION <inscription_id> UNDELEGATED : Return undelegated content of inscription\nINSCRIPTION <inscription_id> INFO : Return inscription info\nINSCRIPTION <inscription_id> METADATA : Returns inscription METADATA\nINSCRIPTION <inscription_id> PARENTS : Returns inscription PARENTS\nINSCRIPTION <inscription_id> CHILDREN : Returns inscription CHILDREN",
      handler: handleInscription
    },
    SAT: {
      description: "Get information about specific satoshis.",
      usage: "SAT <number>",
      details: "SAT <number> : Get information about a specific satoshi",
      handler: handleSat
    },
    TRANSACTION: {
      description: "Query transaction data.",
      usage: "TRANSACTION <txid>",
      details: "TRANSACTION <txid> : Get transaction details",
      handler: handleTransaction
    },
    UTXO: {
      description: "View UTXO information.",
      usage: "UTXO <txid:vout>",
      details: "UTXO <txid:vout> : Get information about a specific UTXO in the format txid:vout",
      handler: handleUtxo
    },
    CLEAR: {
      description: "Clear the console.",
      usage: "CLEAR",
      handler: handleClear
    }
  };
  
  // Process the command entered by the user
  const processCommand = (commandStr: string) => {
    const parts = commandStr.trim().split(' ');
    const primaryCommand = parts[0].toUpperCase();
    
    if (primaryCommand in commands) {
      commands[primaryCommand as keyof typeof commands].handler(parts.slice(1));
    } else {
      appendToConsole(`Unknown command: ${primaryCommand}. Type HELP to see available commands.`, "error");
    }
  };
  
  return (
    <div className="bg-[#1E1E1E] text-[#E0E0E0] font-mono h-screen flex flex-col">
      {/* Console Output */}
      <div
        ref={consoleRef}
        className="flex-1 p-4 overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#555 #1E1E1E'
        }}
      >
        {consoleEntries.map((entry, index) => {
          let content: React.ReactNode;
          
          switch(entry.type) {
            case "input":
              content = (
                <>
                  <span className="text-[#F5A623] mr-2">&gt;</span>
                  <span>{entry.text}</span>
                </>
              );
              break;
            case "error":
              content = <span className="text-[#FF5252]">{entry.text}</span>;
              break;
            case "success":
              content = <span className="text-[#4CAF50]">{entry.text}</span>;
              break;
            case "system":
              content = <span className="text-[#F5A623]">{entry.text}</span>;
              break;
            case "json":
              try {
                // Try to parse and format as JSON
                const formatted = JSON.stringify(JSON.parse(entry.text), null, 2);
                content = (
                  <span 
                    className="text-[#E0E0E0] whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: formatJsonOutput(formatted) }}
                  />
                );
              } catch (e) {
                content = <span className="text-[#E0E0E0]">{entry.text}</span>;
              }
              break;
            default:
              content = <span className="text-[#E0E0E0]">{entry.text}</span>;
          }
          
          return (
            <div key={index} className="mb-2">
              {content}
            </div>
          );
        })}
        
        {/* Inline Command Input */}
        <div className="flex items-center mt-2">
          <span className="text-[#F5A623] mr-2">&gt;</span>
          <input 
            ref={inputRef}
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleCommandInput}
            className="bg-transparent flex-1 outline-none border-none font-mono text-[#E0E0E0]"
            autoFocus
            autoComplete="off"
            disabled={isProcessing}
          />
          <span className="animate-[blink_1.2s_infinite]">|</span>
        </div>
      </div>

      <style>{`
        /* Custom scrollbar for webkit browsers */
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #1E1E1E;
        }
        ::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #777;
        }
        
        /* Ensure consistent monospace rendering */
        .font-mono {
          font-variant-ligatures: none;
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
