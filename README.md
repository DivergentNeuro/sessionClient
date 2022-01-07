# Session Client
Typescript session client for browser and react native.  
Provides awaitable functions for session-related operations (like starting and stopping session components), and TypeScript interfaces for session metadata.

## Usage  
 1. include this repo in your package.json
 2. `npm i`
 3. `import { SessionClient } from "sessionClient"`  
 
## Commands
Execute these commands by awaiting them. Do not execute them concurrently unless otherwise specified.  
`untilConnected` - await me after initializing!  
`joinSession`  
`startSessionComponent` - only one client should be doing this  
`stopSessionComponent` - only one client should be doing this  
`setThreshold`  
`forwardSignal` - don't need to await this function  
