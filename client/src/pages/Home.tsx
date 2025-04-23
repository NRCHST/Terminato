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
  const [ociData, setOciData] = useState<any>(null);
  const [ociLoaded, setOciLoaded] = useState(false);
  
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus input when content changes
  useEffect(() => {
    if (inputRef.current && !isProcessing) {
      inputRef.current.focus();
    }
  }, [consoleEntries, isProcessing]);
  
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
    
    // No block height or block time fetch for the welcome message 
    // Just proceed with a simple welcome message
    
    // Construct welcome message - simplified without block height
    welcomeMessage = `Welcome to Termina.`;
    welcomeMessage += ` The time is ${systemTime}.`;
    
    appendToConsole(welcomeMessage, "system");
    appendToConsole("Type HELP to see your options.", "system");
    
    // Enable user input
    setIsProcessing(false);
  };
  
  // Append text to the console
  const appendToConsole = (text: string, type: ConsoleEntryType = "default") => {
    setConsoleEntries(prev => [...prev, { text, type }]);
    
    // Make sure the window scrolls to the bottom
    setTimeout(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }, 50);
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
      appendToConsole("", "default");
      
      // Bitcoin Districts Bitmap section
      appendToConsole("Bitcoin Districts Bitmap:", "success");
      appendToConsole("OCI - On-Chain Index for Bitcoin Districts (0-839999)", "default");
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
  }
  
  // Handler for OCI (On-Chain Index) command for Bitcoin Districts
  const handleOci = async (args: string[]) => {
    setIsProcessing(true);
    
    // For loading and executing the OCI functions from the inscription
    const loadOciModule = async () => {
      if (ociLoaded && ociData && ociData.getBitmapSat) {
        appendToConsole("OCI module is already loaded.", "success");
        return true;
      }
      
      try {
        appendToConsole("Loading Bitcoin Districts OCI module...", "system");
        appendToConsole("This may take a few moments to load and process the inscription.", "system");
        
        // Fetch the OCI inscription content
        const inscriptionId = "840bc0df4ffc5a7ccedbee35e97506c9577160e233982e627d0045d06366e362i0";
        const url = `${baseUrl}/content/${inscriptionId}`;
        
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          appendToConsole(`Error: Could not load OCI module. Server responded with ${response.status}`, "error");
          return false;
        }
        
        const ociScriptText = await response.text();
        
        // Extract the important functions from the OCI module
        try {
          // We'll implement the core functions from the OCI script directly
          // This avoids trying to execute the script which could be problematic
          
          // The module provides these key functions:
          // - getBitmapSat(bitmapNumber)
          // - getBitmapSatIndex(bitmapNumber)
          // - getBitmapInscriptionId(bitmapNumber)
          
          // Instead of trying to evaluate the script, we'll implement the functions
          // directly based on the script's logic
          
          const allPages = [
            '/content/01bba6c58af39d7f199aa2bceeaaba1ba91b23d2663bc4ef079a4b5e442dbf74i0',
            '/content/bb01dfa977a5cd0ee6e900f1d1f896b5ec4b1e3c7b18f09c952f25af6591809fi0',
            '/content/bb02e94f3062facf6aa2e47eeed348d017fd31c97614170dddb58fc59da304efi0',
            '/content/bb037ec98e6700e8415f95d1f5ca1fe1ba23a3f0c5cb7284d877e9ac418d0d32i0',
            '/content/bb9438f4345f223c6f4f92adf6db12a82c45d1724019ecd7b6af4fcc3f5786cei0',
            '/content/bb0542d4606a9e7eb4f31051e91f7696040db06ca1383dff98505618c34d7df7i0',
            '/content/bb06a4dffba42b6b513ddee452b40a67688562be4a1345127e4d57269e6b2ab6i0',
            '/content/bb076934c1c22007b315dd1dc0f8c4a2f9d52f348320cfbadc7c0bd99eaa5e18i0',
            '/content/bb986a1208380ec7db8df55a01c88c73a581069a51b5a2eb2734b41ba10b65c2i0',
          ];
          
          const satIndices = {
            92871: 1, 92970: 1, 123132: 1, 365518: 1, 700181: 1, 
            826151: 1, 827151: 1, 828151: 1, 828239: 1, 828661: 1,
            829151: 1, 830151: 1, 832104: 2, 832249: 2, 832252: 2,
            832385: 4, 833067: 1, 833101: 3, 833105: 4, 833109: 4,
            833121: 8, 834030: 2, 834036: 2, 834051: 17, 834073: 4,
            836151: 1, 837115: 2, 837120: 2, 837151: 1, 837183: 3,
            837188: 2, 838058: 5, 838068: 2, 838076: 2, 838096: 1,
            838151: 1, 838821: 1, 839151: 1, 839377: 1, 839378: 2,
            839382: 2, 839397: 1, 840151: 1, 841151: 1, 842151: 1,
            845151: 1
          };
          
          // Cache pages as they are loaded
          const pages: any[] = Array(9).fill(0);
          
          // Implementation of the fillPage function from the OCI script
          const fillPage = async (page: number) => {
            appendToConsole(`Loading data for districts ${page * 100000} - ${(page + 1) * 100000 - 1}...`, "default");
            
            try {
              let data;
              const url = `${baseUrl}${allPages[page]}`;
              appendToConsole(`Fetching from: ${url}`, "default");
              
              const response = await fetch(url, { cache: 'no-store' });
              
              if (!response.ok) {
                appendToConsole(`Error: Could not load district data. Server responded with ${response.status}`, "error");
                return false;
              }
              
              const responseText = await response.text();
              
              // Log the first 100 characters of the response for debugging
              const previewText = responseText.length > 100 
                ? responseText.substring(0, 100) + "..." 
                : responseText;
              appendToConsole(`Response preview for page ${page}: ${previewText}`, "default");
              
              // Process based on page format as seen in the Browser implementation
              try {
                if (page === 0 || page === 1) {
                  // Special handling for pages 0 & 1
                  appendToConsole(`Using special processing for page ${page}`, "default");
                  
                  // For pages 0 and 1, manually parse the JSON to get the array structure
                  // Check if it starts with [[ which indicates a proper JSON array of arrays
                  if (responseText.trim().startsWith('[[')) {
                    appendToConsole(`Page ${page} seems to be in correct array format, trying direct parse`, "default");
                    data = JSON.parse(responseText);
                  } else {
                    // Try to parse with additional wrapping
                    appendToConsole(`Page ${page} might need wrapping, trying with additional brackets`, "default");
                    try {
                      // For page 0, we need to handle a special case where the data is a JSON string inside a JSON string
                      // Try to parse the JSON string if needed
                      if (responseText.includes('\\n') || responseText.includes('\\"')) {
                        appendToConsole(`Page ${page} contains escaped JSON, fixing...`, "default");
                        // This might be a JSON string inside a JSON string, try to fix it
                        try {
                          // First parse to get the inner string
                          const parsed = JSON.parse(responseText);
                          
                          if (typeof parsed === 'string') {
                            // If it's a string, try to parse it again
                            appendToConsole(`Parsed to string, now parsing inner JSON...`, "default");
                            const innerParsed = JSON.parse(parsed);
                            data = innerParsed;
                          } else {
                            data = parsed;
                          }
                        } catch (e) {
                          appendToConsole(`Failed first parse approach: ${e instanceof Error ? e.message : String(e)}`, "default");
                          
                          // Try a different approach - remove escapes
                          const fixedResponse = responseText.replaceAll('\\n', '').replaceAll('\\"', '"');
                          data = JSON.parse(fixedResponse);
                        }
                      } else {
                        // If no escapes, just parse it directly
                        data = JSON.parse(responseText);
                      }
                      
                      // Make sure we have the expected array of arrays structure
                      appendToConsole(`Checking data structure for page ${page}...`, "default");
                      
                      if (Array.isArray(data) && Array.isArray(data[0]) && Array.isArray(data[1])) {
                        appendToConsole(`Data structure looks good for page ${page}`, "default");
                      } else {
                        appendToConsole(`Restructuring page ${page} data format`, "default");
                        
                        // If data is not already in the expected format, try to convert it
                        let deltas: number[] = [];
                        let indices: number[] = [];
                        
                        // If it's a plain array, assume it's deltas
                        if (Array.isArray(data) && !Array.isArray(data[0])) {
                          deltas = data.map((d: any) => parseInt(d));
                          // Generate sequential indices
                          indices = Array.from({length: deltas.length}, (_, i) => i);
                        } 
                        // If it's an object, extract key-value pairs
                        else if (typeof data === 'object' && !Array.isArray(data)) {
                          for (const [index, value] of Object.entries(data)) {
                            if (!isNaN(parseInt(index)) && !isNaN(parseInt(value as string))) {
                              indices.push(parseInt(index));
                              deltas.push(parseInt(value as string));
                            }
                          }
                        }
                        
                        if (deltas.length > 0 && indices.length > 0) {
                          appendToConsole(`Created arrays with ${deltas.length} deltas and ${indices.length} indices`, "default");
                          data = [deltas, indices];
                        } else {
                          appendToConsole(`Could not restructure data properly, data might be invalid`, "error");
                        }
                      }
                    } catch (e) {
                      appendToConsole(`Failed to fix page ${page} format: ${e instanceof Error ? e.message : String(e)}`, "error");
                      throw e;
                    }
                  }
                } else if (page === 2 || page === 3) {
                  // Special handling for pages 2 & 3
                  appendToConsole(`Using special processing for page ${page} (adding brackets)`, "default");
                  data = JSON.parse('[' + responseText + ']');
                  data = [data.slice(0, 99999), data.slice(100000, 199999)];
                } else {
                  // Try different parsing approaches for other pages
                  try {
                    appendToConsole(`Trying to parse page ${page} with replaceAll('\\n  ', '')`, "default");
                    data = JSON.parse(responseText.replaceAll('\\n  ', ''));
                  } catch (e) {
                    appendToConsole(`First parse attempt failed: ${e instanceof Error ? e.message : String(e)}`, "default");
                    try {
                      appendToConsole(`Trying to parse page ${page} with replaceAll('  ', '')`, "default");
                      data = JSON.parse(responseText.replaceAll('  ', ''));
                    } catch (e2) {
                      appendToConsole(`Second parse attempt failed: ${e2 instanceof Error ? e2.message : String(e2)}`, "default");
                      // Direct parse as last resort
                      appendToConsole(`Trying direct JSON.parse on page ${page}`, "default");
                      data = JSON.parse(responseText);
                    }
                  }
                }
              
                // Verify the data format
                appendToConsole(`Checking data format for page ${page}...`, "default");
                
                if (!Array.isArray(data)) {
                  appendToConsole(`Error: Data for page ${page} is not an array, got: ${typeof data}`, "error");
                  return false;
                }
                
                if (!Array.isArray(data[0]) || !Array.isArray(data[1])) {
                  appendToConsole(`Error: Data structure for page ${page} is unexpected, data[0] is ${typeof data[0]}, data[1] is ${typeof data[1]}`, "error");
                  return false;
                }
                
              } catch (parseError) {
                appendToConsole(`Error parsing data for page ${page}: ${parseError instanceof Error ? parseError.message : String(parseError)}`, "error");
                return false;
              }
              
              // Rebuild full sat numbers from deltas
              const fullSats: number[] = [];
              data[0].forEach((sat: string | number, i: number) => {
                if (i === 0) {
                  fullSats.push(parseInt(sat as string));
                } else {
                  fullSats.push(parseInt(fullSats[i-1] as unknown as string) + parseInt(sat as string));
                }
              });
              
              // Put them back into correct order
              let filledArray = Array(100000).fill(0);
              data[1].forEach((index: number, i: number) => {
                filledArray[index] = fullSats[i];
              });
              
              // Store the loaded page
              pages[page] = filledArray;
              appendToConsole(`District data for page ${page} loaded successfully!`, "success");
              return true;
            } catch (error) {
              appendToConsole(`Error processing page ${page}: ${error instanceof Error ? error.message : String(error)}`, "error");
              return false;
            }
          };
          
          // Implementation of the getBitmapSat function from the OCI script
          const getBitmapSat = async (bitmapNumber: number) => {
            if (bitmapNumber < 0) {
              appendToConsole('Error: bitmap number is below 0!', "error");
              return null;
            } else if (bitmapNumber > 839999) {
              appendToConsole('Error: bitmap number is above 839,999!', "error");
              return null;
            }
            
            // Determine which page this bitmap is in
            const page = Math.floor(bitmapNumber / 100000);
            
            // If the page has not yet been fetched and cached, then get it
            if (!pages[page]) {
              const success = await fillPage(page);
              if (!success) return null;
            }
            
            return pages[page][bitmapNumber % 100000];
          };
          
          // Implementation of the getBitmapSatIndex function from the OCI script
          const getBitmapSatIndex = (bitmapNumber: number) => {
            return satIndices[bitmapNumber as keyof typeof satIndices] || 0;
          };
          
          // Implementation of the getBitmapInscriptionId function from the OCI script
          const getBitmapInscriptionId = async (bitmapNumber: number) => {
            // First get the sat
            const sat = await getBitmapSat(bitmapNumber);
            if (!sat) return null;
            
            // Get inscription ID from sat endpoint
            try {
              const url = `${baseUrl}/r/sat/${sat}/at/${getBitmapSatIndex(bitmapNumber)}`;
              const response = await fetch(url);
              
              if (!response.ok) {
                appendToConsole(`Error: Could not get inscription ID. Server responded with ${response.status}`, "error");
                return null;
              }
              
              const data = await response.json();
              return data.id;
            } catch (error) {
              appendToConsole(`Error getting inscription ID: ${error instanceof Error ? error.message : String(error)}`, "error");
              return null;
            }
          };
          
          // Store the core functions in ociData
          setOciData({
            rawScript: ociScriptText,
            getBitmapSat,
            getBitmapSatIndex,
            getBitmapInscriptionId,
            allPages,
            satIndices,
            pages
          });
          
          setOciLoaded(true);
          appendToConsole("OCI module loaded successfully!", "success");
          return true;
        } catch (error) {
          appendToConsole(`Error processing OCI module: ${error instanceof Error ? error.message : String(error)}`, "error");
          return false;
        }
      } catch (error) {
        appendToConsole(`Error loading OCI module: ${error instanceof Error ? error.message : String(error)}`, "error");
        return false;
      }
    };
    
    // Check if a specific command was provided
    if (args.length > 0) {
      const subcommand = args[0].toUpperCase();
      
      if (subcommand === "LOAD") {
        // Load the OCI module
        await loadOciModule();
      } else {
        // Treat as a district number
        const districtNumber = parseInt(args[0], 10);
        
        if (isNaN(districtNumber)) {
          appendToConsole(`Invalid district number: ${args[0]}`, "error");
        } else if (districtNumber < 0 || districtNumber > 839999) {
          appendToConsole(`District number must be between 0 and 839999`, "error");
        } else {
          // First make sure the OCI module is loaded
          const loaded = ociLoaded || await loadOciModule();
          
          if (loaded && ociData) {
            appendToConsole(`Resolving sat number for Bitcoin District #${districtNumber}...`, "default");
            
            try {
              const sat = await ociData.getBitmapSat(districtNumber);
              
              if (sat) {
                const satIndex = ociData.getBitmapSatIndex(districtNumber);
                appendToConsole(`Bitcoin District #${districtNumber} corresponds to sat ${sat}`, "success");
                
                if (satIndex > 0) {
                  appendToConsole(`Note: This district's bitmap is inscription #${satIndex} on this sat`, "default");
                }
                
                // Try to get the inscription ID
                appendToConsole("Fetching inscription ID...", "default");
                const inscriptionId = await ociData.getBitmapInscriptionId(districtNumber);
                
                if (inscriptionId) {
                  appendToConsole(`Inscription ID: ${inscriptionId}`, "success");
                  appendToConsole(`Explore at: ${baseUrl}/inscription/${inscriptionId}`, "default");
                } else {
                  appendToConsole("Could not fetch inscription ID.", "error");
                }
              } else {
                appendToConsole(`Could not resolve sat number for district ${districtNumber}.`, "error");
              }
            } catch (error) {
              appendToConsole(`Error processing district: ${error instanceof Error ? error.message : String(error)}`, "error");
            }
          }
        }
      }
    } else {
      // No arguments provided, show OCI status
      if (ociLoaded && ociData) {
        appendToConsole("OCI Status: Bitcoin Districts mapping ready.", "success");
        appendToConsole("Use OCI <district_number> to lookup the sat number for a specific district.", "default");
        
        // Show how many district pages are loaded
        const loadedPages = ociData.pages ? ociData.pages.filter((p: any) => p !== 0).length : 0;
        appendToConsole(`${loadedPages} of 9 district pages are currently loaded.`, "default");
        appendToConsole("Pages are loaded on demand when you query a district number.", "default");
      } else {
        appendToConsole("OCI Status: Bitcoin Districts mapping not initialized.", "default");
        appendToConsole("Use OCI LOAD to prepare the system, or OCI <district_number> to look up directly.", "default");
      }
    }
    
    setIsProcessing(false);
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
    },
    OCI: {
      description: "On-Chain Index for Bitcoin Districts (0-839999).",
      usage: "OCI [LOAD|<district_number>]",
      details:
`OCI : Shows current OCI status
OCI LOAD : Loads sat numbers for bitmap districts 0-839999
OCI <district_number> : Resolves the specific district's sat number`,
      handler: handleOci
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
    <div className="bg-[#1E1E1E] text-[#E0E0E0] font-mono min-h-screen flex flex-col">
      {/* Console Output */}
      <div
        ref={consoleRef}
        className="w-full p-4"
        style={{
          overflowY: 'visible',
          minHeight: 'calc(100vh - 40px)'
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
