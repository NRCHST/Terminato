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
  const [currentMode, setCurrentMode] = useState<"WEB" | "ORD">("ORD");
  const [baseUrl, setBaseUrl] = useState("");
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    { text: "Initializing Termina... checking available connectivity mode...", type: "system" }
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(true);
  
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Keep the console scrolled to the bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleEntries]);
  
  // Focus the input when the component mounts and auto-detect mode
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // Auto-detect mode on startup
    detectMode();
  }, []);
  
  // Function to detect mode (ORD or WEB)
  const detectMode = async () => {
    appendToConsole("Testing connectivity modes...", "default");
    
    // Try ORD mode first (local server)
    let ordModeWorks = false;
    let blockTime = "";
    let blockHeight = "";
    
    try {
      const ordResponse = await fetch("/r/blocktime", { 
        signal: AbortSignal.timeout(3000),
        // Add cache: 'no-store' to prevent caching issues
        cache: 'no-store' 
      });
      
      // Check not just if response is ok, but also that we can get actual data
      if (ordResponse.ok) {
        const data = await ordResponse.text();
        // Verify we got a valid Unix timestamp (numeric response)
        if (data && data.trim() !== "" && !isNaN(Number(data.trim()))) {
          ordModeWorks = true;
          blockTime = data.trim();
          appendToConsole("Local ORD server detected!", "success");
        }
      }
    } catch (error) {
      appendToConsole("No local ORD server detected.", "default");
    }
    
    // Try WEB mode
    let webModeWorks = false;
    try {
      const webResponse = await fetch("https://ordinals.com/r/blocktime", { 
        signal: AbortSignal.timeout(5000),
        cache: 'no-store' 
      });
      
      if (webResponse.ok) {
        const data = await webResponse.text();
        // Verify we got a valid Unix timestamp (numeric response)
        if (data && data.trim() !== "" && !isNaN(Number(data.trim()))) {
          webModeWorks = true;
          if (blockTime === "") {
            blockTime = data.trim();
          }
          appendToConsole("Web connectivity detected!", "success");
        }
      }
    } catch (error) {
      appendToConsole("Web connectivity failed.", "error");
    }
    
    // Set the mode based on which connection worked and generate welcome message
    const now = new Date();
    const systemTime = now.toLocaleString();
    
    let welcomeMessage = "";
    
    // Set the appropriate mode
    if (ordModeWorks) {
      setCurrentMode("ORD");
      setBaseUrl("");
      appendToConsole("Using ORD mode.", "success");
    } else if (webModeWorks) {
      setCurrentMode("WEB");
      setBaseUrl("https://ordinals.com");
      appendToConsole("Using WEB mode.", "success");
    } else {
      // If both modes failed
      appendToConsole("Could not connect to either local ORD server or ordinals.com", "error");
      appendToConsole("Defaulting to WEB mode. You may need to change modes manually.", "system");
      setCurrentMode("WEB");
      setBaseUrl("https://ordinals.com");
    }
    
    // Try to get the block height for welcome message using a dedicated BLOCK HEIGHT command
    try {
      // First - just use the BLOCK HEIGHT command directly with no extra scraping
      // Simple direct fetch with no parsing
      const blockHeightCommand = async (): Promise<string | null> => {
        try {
          // Try the command with specific headers
          const response = await fetch(`${baseUrl}/r/blockheight`, {
            cache: 'no-store',
            headers: {
              'Accept': 'text/plain',
              'Content-Type': 'text/plain'
            }
          });
          
          if (!response.ok) return null;
          
          const text = await response.text();
          // Strict validation: must be a number and in the valid Bitcoin block height range
          // Current Bitcoin block height is ~893,644 (April 2025)
          if (!isNaN(Number(text.trim()))) {
            const height = Number(text.trim());
            // Bitcoin block height should be in this range in 2025
            if (height > 800000 && height < 900000) {
              return text.trim();
            }
          }
          return null;
        } catch (e) {
          console.error("Direct height request failed:", e);
          return null;
        }
      };
      
      // Try the direct command first
      blockHeight = await blockHeightCommand();
      
      // If that failed, try a fallback
      if (!blockHeight) {
        try {
          // Just hardcode the command we know works properly
          appendToConsole("Running BLOCK HEIGHT command directly...", "default");
          
          // This is basically what our BLOCK HEIGHT command does
          const getBlockHeight = async (): Promise<string | null> => {
            try {
              const response = await fetch(`${baseUrl}/r/blockheight`, { cache: 'no-store' });
              if (response.ok) {
                const text = await response.text();
                
                // Look specifically for bitcoin block heights (800,000-900,000 range in 2025)
                const matches = text.match(/\b(8\d{5}|9[0-8]\d{4})\b/g);
                if (matches && matches.length > 0) {
                  return matches[0];
                }
                
                // If that didn't work, try a more general regex for 6-digit numbers
                const sixDigitMatch = text.match(/\b\d{6}\b/g);
                if (sixDigitMatch && sixDigitMatch.length > 0) {
                  // Verify it's in a reasonable range for Bitcoin (over 800,000)
                  const num = parseInt(sixDigitMatch[0], 10);
                  if (num > 800000 && num < 900000) {
                    return sixDigitMatch[0];
                  }
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          };
          
          blockHeight = await getBlockHeight();
        } catch (e) {
          console.error("Fallback height attempt failed:", e);
        }
      }
      
      console.log("Block height for welcome:", blockHeight);
    } catch (error) {
      console.error("Error fetching block height:", error);
    }
    
    // Format the block time if available
    let blockTimeFormatted = "";
    if (blockTime && !isNaN(Number(blockTime))) {
      const blockDate = new Date(Number(blockTime) * 1000);
      blockTimeFormatted = blockDate.toLocaleString();
    }
    
    // Construct welcome message
    welcomeMessage = `Welcome to Termina. You are in ${currentMode} mode.`;
    welcomeMessage += ` The time is ${systemTime}`;
    
    if (blockHeight) {
      welcomeMessage += ` and the latest block was ${blockHeight}`;
      if (blockTimeFormatted) {
        welcomeMessage += ` at ${blockTimeFormatted}`;
      }
    }
    welcomeMessage += ".";
    
    appendToConsole(welcomeMessage, "system");
    appendToConsole("Type HELP to see your options.", "system");
    
    // Enable user input
    setIsProcessing(false);
  };
  
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
      appendToConsole("MODE - Switch between WEB and ORD mode", "default");
      appendToConsole("CLEAR - Clear the console", "default");
      appendToConsole("TIME - Display current system time", "default");
      appendToConsole("", "default");
      
      // Ordinals section with different color
      appendToConsole("Ordinals Recursive Endpoints:", "success");
      appendToConsole("BLOCK - Retrieve block information (height, hash, time)", "default");
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
          // Split details by lines and display each line separately for proper formatting
          const lines = command.details.split('\n');
          lines.forEach(line => {
            appendToConsole(line, "default");
          });
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
    if (mode === "WEB") {
      setCurrentMode("WEB");
      setBaseUrl("https://ordinals.com");
      appendToConsole("Switched to WEB mode. Using https://ordinals.com prefix.", "success");
    } else if (mode === "ORD") {
      setCurrentMode("ORD");
      setBaseUrl("");
      appendToConsole("Switched to ORD mode. Using no prefix (requires local ord server).", "success");
    } else {
      appendToConsole(`Invalid mode: ${mode}. Available modes: WEB, ORD`, "error");
    }
  };
  
  const handleBlock = async (args: string[]) => {
    setIsProcessing(true);
    
    try {
      let url;
      let response;
      let data;
      
      // Check for BLOCKTIME or BLOCK TIME command
      if (args.length > 0 && (args[0].toUpperCase() === "TIME" || args[0].toUpperCase() === "BLOCKTIME")) {
        // Get the raw blocktime from API
        url = `${baseUrl}/r/blocktime`;
        
        // Check for additional options
        const option = args.length > 1 ? args[1].toUpperCase() : "";
        
        response = await fetch(url, { cache: 'no-store' });
        
        if (!response.ok) {
          appendToConsole(`Error: Server responded with status ${response.status}`, "error");
          return;
        }
        
        const blockTime = await response.text();
        
        // Check if the response is a valid Unix timestamp (numeric)
        if (!isNaN(Number(blockTime.trim()))) {
          const timestamp = Number(blockTime.trim()) * 1000;
          const date = new Date(timestamp);
          const localDateTime = date.toLocaleString(); // Uses system timezone
          
          if (option === "UNIX") {
            // Unix timestamp only
            appendToConsole(`Current block time (Unix): ${blockTime}`, "success");
          } else if (option === "LOCAL") {
            // Local time only
            appendToConsole(`Current block time (Local): ${localDateTime}`, "success");
          } else {
            // Both formats (default)
            appendToConsole(`Current block time: ${blockTime} (${localDateTime})`, "success");
          }
        } else {
          appendToConsole(`Current block time: ${blockTime}`, "success");
        }
        return;
      }
      
      // Handle HEIGHT or HASH commands
      if (args.length > 0) {
        const command = args[0].toUpperCase();
        
        if (command === "HEIGHT") {
          // Get latest block height
          appendToConsole("Fetching latest block height...", "default");
          
          // Define a function to try different methods of getting block height
          const getBlockHeight = async (): Promise<string | null> => {
            // Method 1: Simple request with text/plain header
            try {
              const response = await fetch(`${baseUrl}/r/blockheight`, {
                cache: 'no-store',
                headers: {
                  'Accept': 'text/plain'
                }
              });
              
              if (response.ok) {
                const text = await response.text();
                if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                  return text.trim();
                }
              }
            } catch (e) {
              console.error("First height method failed:", e);
            }
            
            // Method 2: Try /r/height endpoint 
            try {
              const response = await fetch(`${baseUrl}/r/height`, { cache: 'no-store' });
              if (response.ok) {
                const text = await response.text();
                if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                  return text.trim();
                }
              }
            } catch (e) {
              console.error("Second height method failed:", e);
            }
            
            // Method 3: Try a block info request to extract height
            try {
              const response = await fetch(`${baseUrl}/r/blockinfo/tip`, { cache: 'no-store' });
              if (response.ok) {
                const data = await response.json();
                if (data && data.height && !isNaN(Number(data.height))) {
                  return data.height.toString();
                }
              }
            } catch (e) {
              console.error("Third height method failed:", e);
            }
            
            return null;
          };
          
          // Try to get the height
          const height = await getBlockHeight();
          
          if (height) {
            appendToConsole(`Current block height: ${height}`, "success");
          } else {
            appendToConsole("Could not retrieve block height", "error");
          }
          return;
        }
        
        if (command === "HASH") {
          // Get block hash
          let blockHeight;
          
          if (args.length > 1) {
            // Get hash for specific height
            blockHeight = args[1];
            appendToConsole(`Fetching block hash for height ${blockHeight}...`, "default");
          } else {
            // Get hash for latest block
            appendToConsole("Fetching latest block hash...", "default");
            
            // Define a function to try different methods of getting block height
            const getBlockHeight = async (): Promise<string | null> => {
              // Method 1: Simple request with text/plain header
              try {
                const response = await fetch(`${baseUrl}/r/blockheight`, {
                  cache: 'no-store',
                  headers: {
                    'Accept': 'text/plain'
                  }
                });
                
                if (response.ok) {
                  const text = await response.text();
                  if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                    return text.trim();
                  }
                }
              } catch (e) {
                console.error("First height method failed:", e);
              }
              
              // Method 2: Try /r/height endpoint 
              try {
                const response = await fetch(`${baseUrl}/r/height`, { cache: 'no-store' });
                if (response.ok) {
                  const text = await response.text();
                  if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                    return text.trim();
                  }
                }
              } catch (e) {
                console.error("Second height method failed:", e);
              }
              
              // Method 3: Try a block info request to extract height
              try {
                const response = await fetch(`${baseUrl}/r/blockinfo/tip`, { cache: 'no-store' });
                if (response.ok) {
                  const data = await response.json();
                  if (data && data.height && !isNaN(Number(data.height))) {
                    return data.height.toString();
                  }
                }
              } catch (e) {
                console.error("Third height method failed:", e);
              }
              
              return null;
            };
            
            // Try to get the height
            blockHeight = await getBlockHeight();
            
            if (!blockHeight) {
              appendToConsole("Could not retrieve block height for hash lookup", "error");
              return;
            }
          }
          
          // Now get the block info to extract the hash
          url = `${baseUrl}/r/blockinfo/${blockHeight}`;
          response = await fetch(url);
          
          if (!response.ok) {
            appendToConsole(`Error: Server responded with status ${response.status}`, "error");
            return;
          }
          
          data = await response.json();
          
          if (data && data.hash) {
            appendToConsole(`Block hash for height ${blockHeight}: ${data.hash}`, "success");
          } else {
            appendToConsole("Could not retrieve block hash", "error");
          }
          return;
        }
      }
      
      // If no arguments, get the latest block info
      if (args.length === 0) {
        // Define a function to try different methods of getting block height
        const getBlockHeight = async (): Promise<string | null> => {
          // Method 1: Simple request with text/plain header
          try {
            const response = await fetch(`${baseUrl}/r/blockheight`, {
              cache: 'no-store',
              headers: {
                'Accept': 'text/plain'
              }
            });
            
            if (response.ok) {
              const text = await response.text();
              if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                return text.trim();
              }
            }
          } catch (e) {
            console.error("First height method failed:", e);
          }
          
          // Method 2: Try /r/height endpoint 
          try {
            const response = await fetch(`${baseUrl}/r/height`, { cache: 'no-store' });
            if (response.ok) {
              const text = await response.text();
              if (!isNaN(Number(text.trim())) && text.trim().length < 12) {
                return text.trim();
              }
            }
          } catch (e) {
            console.error("Second height method failed:", e);
          }
          
          // Method 3: Try a block info request to extract height
          try {
            const response = await fetch(`${baseUrl}/r/blockinfo/tip`, { cache: 'no-store' });
            if (response.ok) {
              const data = await response.json();
              if (data && data.height && !isNaN(Number(data.height))) {
                return data.height.toString();
              }
            }
          } catch (e) {
            console.error("Third height method failed:", e);
          }
          
          return null;
        };
        
        // Try to get the height
        const height = await getBlockHeight();
        
        if (!height) {
          appendToConsole("Could not retrieve block height", "error");
          return;
        }
        
        url = `${baseUrl}/r/blockinfo/${height}`;
        appendToConsole(`Retrieving latest block (height: ${height})...`, "default");
        response = await fetch(url);
        data = await response.json();
        appendToConsole(JSON.stringify(data, null, 2), "json");
      } else {
        // Handle block by hash or height
        const blockId = args[0]; // Could be a hash or height
        url = `${baseUrl}/r/blockinfo/${blockId}`;
        appendToConsole(`Retrieving block ${blockId}...`, "default");
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
            // Try using metadata endpoint
            url = `${baseUrl}/r/metadata/${inscriptionId}`;
            appendToConsole(`Fetching metadata from: ${url}`, "default");
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
          // Try using the direct metadata endpoint
          url = `${baseUrl}/r/metadata/${inscriptionId}`;
          appendToConsole(`Fetching metadata from: ${url}`, "default");
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
  

  
  const handleTime = (args: string[]) => {
    setIsProcessing(true);
    
    try {
      const now = new Date();
      const unixTime = Math.floor(now.getTime() / 1000);
      const localTime = now.toLocaleString();
      
      if (args.length > 0) {
        const option = args[0].toUpperCase();
        
        if (option === "UNIX") {
          appendToConsole(`Current system time (Unix): ${unixTime}`, "success");
        } else if (option === "CURRENT" || option === "LOCAL") {
          appendToConsole(`Current system time (Local): ${localTime}`, "success");
        } else {
          appendToConsole(`Unknown TIME option: ${option}. Valid options: UNIX, CURRENT`, "error");
        }
      } else {
        // Default: show both formats
        appendToConsole(`Current system time: ${unixTime} (${localTime})`, "success");
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
      description: "Switch between WEB and ORD mode.",
      usage: "MODE [WEB|ORD]",
      details: 
`MODE WEB : switches to WEB mode, with https://ordinals.com prefix for recursive endpoints
MODE ORD : switches to ORD mode, without prefix (requires local ord server)`,
      handler: handleMode
    },
    BLOCK: {
      description: "Retrieve block information.",
      usage: "BLOCK [<hash or height>|HEIGHT|HASH|TIME]",
      details: 
`BLOCK : get latest block info
BLOCK <hash/height> : get block info at specified HASH or HEIGHT
BLOCK HEIGHT : get latest block height
BLOCK HASH : get latest block hash
BLOCK HASH <height> : get block hash at specific height
BLOCK TIME : shows the current block time (Unix and local)
BLOCK TIME UNIX : shows only Unix timestamp
BLOCK TIME LOCAL : shows only local time format`,
      handler: handleBlock
    },
    TIME: {
      description: "Display current system time.",
      usage: "TIME [UNIX|CURRENT]",
      details:
`TIME : shows current system time in both Unix and local format
TIME UNIX : shows only Unix timestamp 
TIME CURRENT : shows only local time format`,
      handler: handleTime
    },
    INSCRIPTION: {
      description: "Query inscription data.",
      usage: "INSCRIPTION <inscription_id> [CONTENT|UNDELEGATED|INFO|METADATA|PARENTS|CHILDREN]",
      details: 
`INSCRIPTION <inscription_id> : This is the main command, returns all information
INSCRIPTION <inscription_id> CONTENT : Return content only of inscription
INSCRIPTION <inscription_id> UNDELEGATED : Return undelegated content of inscription
INSCRIPTION <inscription_id> INFO : Return inscription info
INSCRIPTION <inscription_id> METADATA : Returns inscription METADATA
INSCRIPTION <inscription_id> PARENTS : Returns inscription PARENTS
INSCRIPTION <inscription_id> CHILDREN : Returns inscription CHILDREN`,
      handler: handleInscription
    },
    SAT: {
      description: "Get information about specific satoshis.",
      usage: "SAT <number>",
      details: `SAT <number> : Check inscriptions on a specific SAT`,
      handler: handleSat
    },
    TRANSACTION: {
      description: "Query transaction data.",
      usage: "TRANSACTION <txid>",
      details: `TRANSACTION <txid> : Get transaction details`,
      handler: handleTransaction
    },
    UTXO: {
      description: "View UTXO information.",
      usage: "UTXO <txid:vout>",
      details: `UTXO <txid:vout> : Get information about a specific UTXO in the format txid:vout`,
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
    
    // Handle BLOCKTIME command separately (route to BLOCK TIME)
    if (primaryCommand === "BLOCKTIME") {
      commands["BLOCK"].handler(["TIME"]);
      return;
    }
    
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
