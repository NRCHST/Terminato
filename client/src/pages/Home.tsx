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
  
  // CBOR major type tags
  const CBOR_TYPES = {
    UNSIGNED_INT: 0,
    NEGATIVE_INT: 1,
    BYTE_STRING: 2,
    TEXT_STRING: 3,
    ARRAY: 4,
    MAP: 5,
    TAG: 6,
    SIMPLE_AND_FLOAT: 7
  };
  
  // Function to convert hex to text
  const hexToText = (hex: string): string => {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const hexValue = parseInt(hex.substr(i, 2), 16);
      // Only convert to character if it's a printable ASCII code
      if (hexValue >= 32 && hexValue <= 126) {
        str += String.fromCharCode(hexValue);
      } else {
        // For non-printable characters, show the hex value
        str += `\\x${hex.substr(i, 2)}`;
      }
    }
    return str;
  };

  // Simple CBOR decoder function (supports basic types, assuming valid CBOR)
  const decodeCBOR = (buffer: ArrayBuffer): any => {
    const bytes = new Uint8Array(buffer);
    let position = 0;
    
    function readByte(): number {
      return bytes[position++];
    }
    
    function readLength(initialByte: number): number {
      const additionalInfo = initialByte & 0x1f;
      
      if (additionalInfo < 24) {
        return additionalInfo;
      } else if (additionalInfo === 24) {
        return readByte();
      } else if (additionalInfo === 25) {
        return (readByte() << 8) | readByte();
      } else if (additionalInfo === 26) {
        return (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
      } else if (additionalInfo === 27) {
        // This is a simplification for JavaScript as it doesn't handle 64-bit integers well
        return ((readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte()) * Math.pow(2, 32) + 
               ((readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte());
      }
      
      throw new Error(`Unsupported length encoding: ${additionalInfo}`);
    }
    
    function readByteString(length: number): Uint8Array {
      const result = bytes.slice(position, position + length);
      position += length;
      return result;
    }
    
    function readTextString(length: number): string {
      const byteString = readByteString(length);
      return new TextDecoder().decode(byteString);
    }
    
    function decode(): any {
      const initialByte = readByte();
      const majorType = initialByte >> 5;
      const length = readLength(initialByte);
      
      switch (majorType) {
        case CBOR_TYPES.UNSIGNED_INT:
          return length;
          
        case CBOR_TYPES.NEGATIVE_INT:
          return -1 - length;
          
        case CBOR_TYPES.BYTE_STRING:
          // Convert byte string to hex string for better display
          const byteStr = readByteString(length);
          return Array.from(byteStr)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
          
        case CBOR_TYPES.TEXT_STRING:
          return readTextString(length);
          
        case CBOR_TYPES.ARRAY:
          const array = [];
          for (let i = 0; i < length; i++) {
            array.push(decode());
          }
          return array;
          
        case CBOR_TYPES.MAP:
          const map: Record<string, any> = {};
          for (let i = 0; i < length; i++) {
            const key = decode();
            map[key.toString()] = decode();
          }
          return map;
          
        case CBOR_TYPES.TAG:
          return {
            tag: length,
            value: decode()
          };
          
        case CBOR_TYPES.SIMPLE_AND_FLOAT:
          if (length === 20) return false;
          if (length === 21) return true;
          if (length === 22) return null;
          if (length === 23) return undefined;
          if (length === 25) {
            // 16-bit float (simplified)
            return "FLOAT16_UNSUPPORTED";
          }
          if (length === 26) {
            // 32-bit float
            const float32arr = new Float32Array(bytes.buffer.slice(position, position + 4));
            position += 4;
            return float32arr[0];
          }
          if (length === 27) {
            // 64-bit float
            const float64arr = new Float64Array(bytes.buffer.slice(position, position + 8));
            position += 8;
            return float64arr[0];
          }
          return length;
          
        default:
          throw new Error(`Unsupported CBOR major type: ${majorType}`);
      }
    }
    
    return decode();
  };
  
  // Attempt to decode metadata which might be CBOR format
  const decodeMetadata = (buffer: ArrayBuffer | string): string => {
    try {
      // If it's a string, try to convert it to a buffer first
      if (typeof buffer === 'string') {
        const str = buffer;
        // Handle binary string
        if (/^[\x00-\xFF]*$/.test(str)) {
          const bytes = new Uint8Array(str.length);
          for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i);
          }
          buffer = bytes.buffer;
        } else {
          return buffer; // If not a binary string, return as is
        }
      }
      
      // Try to decode as CBOR
      const decoded = decodeCBOR(buffer);
      return JSON.stringify(decoded, null, 2);
    } catch (error) {
      console.error("Failed to decode CBOR:", error);
      
      // Return original data if it can't be parsed
      if (typeof buffer === 'string') {
        return buffer;
      } else {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      }
    }
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
            // Try using metadata endpoint
            url = `${baseUrl}/r/metadata/${inscriptionId}`;
            appendToConsole(`Fetching metadata from: ${url}`, "default");
            response = await fetch(url);
            
            if (response.ok) {
              // Get the response as an ArrayBuffer to handle binary formats like CBOR
              const buffer = await response.arrayBuffer();
              if (!buffer || buffer.byteLength === 0) {
                appendToConsole("METADATA: No metadata available for this inscription", "system");
              } else {
                appendToConsole("METADATA:", "success");
                
                try {
                  try {
                    // Try as CBOR first (primary method)
                    try {
                      const decodedMetadata = decodeMetadata(buffer);
                      
                      // For simple values (like numbers, booleans), format them for better display
                      const result = typeof decodedMetadata === 'object' 
                        ? JSON.stringify(decodedMetadata, null, 2)
                        : `Value: ${decodedMetadata} (${typeof decodedMetadata})`;
                        
                      appendToConsole(result, "json");
                    } catch (cborError) {
                      // If CBOR decoding fails, try hex decoding if it looks like a hex string
                      const text = new TextDecoder().decode(buffer);
                      
                      // Check if the text is a JSON string containing hex (common with ordinals)
                      if (text.startsWith('"') && text.endsWith('"')) {
                        try {
                          // Remove the quotes and decode hex
                          const hexContent = text.substring(1, text.length - 1);
                          // Check if it's a valid hex string
                          if (/^[0-9a-fA-F]+$/.test(hexContent)) {
                            // Convert hex to readable text
                            const hexDecoded = hexToText(hexContent);
                            appendToConsole(`Hex Decoded: ${hexDecoded}`, "success");
                          } else {
                            // Not a hex string, just show the content
                            appendToConsole(text, "default");
                          }
                        } catch (hexError) {
                          appendToConsole(text, "default");
                        }
                      } else {
                        // Regular text, just display it
                        appendToConsole(text, "default");
                      }
                    }
                  } catch (error) {
                    // If all else fails, show as plain text
                    const text = new TextDecoder().decode(buffer);
                    appendToConsole(text, "default");
                  }
                } catch (error) {
                  appendToConsole(`Error decoding metadata: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
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
            // Get the response as an ArrayBuffer to handle binary formats like CBOR
            const buffer = await response.arrayBuffer();
            if (!buffer || buffer.byteLength === 0) {
              appendToConsole("No metadata available for this inscription", "system");
            } else {
              appendToConsole("METADATA:", "success");
              
              try {
                // First check for hex-encoded string (common in Ordinals)
                const text = new TextDecoder().decode(buffer);
                  
                // Check if it's a JSON string containing hex
                if (text.startsWith('"') && text.endsWith('"')) {
                  // Extract the hex string without quotes
                  const hexString = text.substring(1, text.length - 1);
                  
                  // Check if it looks like a hex string
                  if (/^[0-9a-fA-F]+$/.test(hexString)) {
                    // Convert hex to text
                    const decoded = hexToText(hexString);
                    appendToConsole(`Hex Decoded: ${decoded}`, "success");
                  } else {
                    // Try CBOR as fallback
                    try {
                      const decodedMetadata = decodeMetadata(buffer);
                      const result = typeof decodedMetadata === 'object' 
                        ? JSON.stringify(decodedMetadata, null, 2)
                        : `Value: ${decodedMetadata} (${typeof decodedMetadata})`;
                      appendToConsole(result, "json");
                    } catch (cborError) {
                      appendToConsole(text, "default");
                    }
                  }
                } else {
                  // If not a hex string, try CBOR
                  try {
                    const decodedMetadata = decodeMetadata(buffer);
                    const result = typeof decodedMetadata === 'object' 
                      ? JSON.stringify(decodedMetadata, null, 2)
                      : `Value: ${decodedMetadata} (${typeof decodedMetadata})`;
                    appendToConsole(result, "json");
                  } catch (cborError) {
                    appendToConsole(text, "default");
                  }
                }
              } catch (error) {
                appendToConsole(`Error decoding metadata: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
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
