import React,{useEffect,useMemo,useState}from'react';

const EMPTY=Array(9).fill('');
const WIN=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const trivia=[
 {q:'Which planet is known as the Red Planet?',a:['Earth','Mars','Jupiter','Venus'],correct:1},
 {q:'What does HTTP stand for?',a:['HyperText Transfer Protocol','High Transfer Text Process','Hyperlink Transfer Type Protocol','Host Transfer Tool Protocol'],correct:0},
 {q:'Which language is primarily used to style web pages?',a:['Python','SQL','CSS','Java'],correct:2},
 {q:'What is the capital of Japan?',a:['Kyoto','Osaka','Tokyo','Sapporo'],correct:2},
 {q:'Which data structure uses FIFO ordering?',a:['Stack','Queue','Tree','Graph'],correct:1}
];

function TicTacToe({socket,roomId,user}){
 const[board,setBoard]=useState(EMPTY),[turn,setTurn]=useState('X'),[winner,setWinner]=useState(null),[symbol,setSymbol]=useState(null);
 useEffect(()=>{const h=d=>{if(d.roomId!==roomId)return;setBoard(d.board);setTurn(d.turn);setWinner(d.winner);setSymbol(d.players?.[user.id]||null)};socket.on('game:tictactoe',h);socket.emit('game:tictactoe:join',{roomId});return()=>socket.off('game:tictactoe',h)},[socket,roomId,user.id]);
 const play=i=>{if(winner||board[i]||!symbol||symbol!==turn)return;socket.emit('game:tictactoe:move',{roomId,index:i})};
 return <div className="gameBox"><div className="gameTop"><b>Tic-Tac-Toe</b><span>{winner?winner==='draw'?'Draw!':`${winner} wins!`:symbol?`You are ${symbol} · ${turn}'s turn`:'Joining…'}</span></div><div className="ttt">{board.map((x,i)=><button key={i} onClick={()=>play(i)}>{x}</button>)}</div>{winner&&<button className="gameReset" onClick={()=>socket.emit('game:tictactoe:reset',{roomId})}>New game</button>}</div>
}

function ConnectFour({socket,roomId,user}){
 const[board,setBoard]=useState(Array(42).fill('')), [turn,setTurn]=useState('R'),[winner,setWinner]=useState(null),[symbol,setSymbol]=useState(null);
 useEffect(()=>{const h=d=>{if(d.roomId!==roomId)return;setBoard(d.board);setTurn(d.turn);setWinner(d.winner);setSymbol(d.players?.[user.id]||null)};socket.on('game:connect4',h);socket.emit('game:connect4:join',{roomId});return()=>socket.off('game:connect4',h)},[socket,roomId,user.id]);
 const drop=col=>{if(winner||!symbol||symbol!==turn)return;socket.emit('game:connect4:move',{roomId,col})};
 return <div className="gameBox"><div className="gameTop"><b>Connect Four</b><span>{winner?winner==='draw'?'Draw!':`${winner} wins!`:symbol?`You are ${symbol} · ${turn}'s turn`:'Joining…'}</span></div><div className="c4">{board.map((x,i)=><button key={i} onClick={()=>drop(i%7)} className={x==='R'?'redDisc':x==='Y'?'yellowDisc':''}>{x}</button>)}</div>{winner&&<button className="gameReset" onClick={()=>socket.emit('game:connect4:reset',{roomId})}>New game</button>}</div>
}

function Trivia({socket,roomId}){
 const[index,setIndex]=useState(0),[score,setScore]=useState({}),[locked,setLocked]=useState(false);const item=trivia[index];
 useEffect(()=>{const h=d=>{if(d.roomId!==roomId)return;setIndex(d.index);setScore(d.score);setLocked(false)};socket.on('game:trivia',h);return()=>socket.off('game:trivia',h)},[socket,roomId]);
 const answer=i=>{if(locked)return;setLocked(true);socket.emit('game:trivia:answer',{roomId,answer:i,correct:item.correct})};
 return <div className="gameBox"><div className="gameTop"><b>Trivia Battle</b><span>{Object.entries(score).map(([k,v])=>`${k.slice(0,8)}: ${v}`).join(' · ')||'First to answer'}</span></div><h3>{item.q}</h3><div className="answers">{item.a.map((a,i)=><button key={a} onClick={()=>answer(i)}>{a}</button>)}</div><button className="gameReset" onClick={()=>socket.emit('game:trivia:next',{roomId})}>Next question</button></div>
}

function CustomQuestions({socket,roomId}){
 const[q,setQ]=useState(''),[saved,setSaved]=useState([]),[analysis,setAnalysis]=useState(null);
 const submit=()=>{if(!q.trim())return;socket.emit('question:add',{roomId,text:q.trim()});setQ('')};
 useEffect(()=>{const h=d=>{if(d.roomId===roomId){setSaved(d.questions||[]);setAnalysis(d.analysis||null)}};socket.on('question:update',h);socket.emit('question:list',{roomId});return()=>socket.off('question:update',h)},[socket,roomId]);
 return <div className="gameBox"><div className="gameTop"><b>Question Lab</b><span>Shared room questions</span></div><div className="questionForm"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Write a question for everyone…"/><button onClick={submit}>Add</button></div>{analysis&&<div className="analysis"><b>AI-ready analysis</b><span>Category: {analysis.category} · Type: {analysis.type} · Similarity: {Math.round(analysis.similarity*100)}%</span></div>}<div className="questionList">{saved.map(x=><div key={x.id}><span>{x.text}</span><small>{x.category}</small></div>)}</div></div>
}

export default function Games({socket,roomId,user}){
 const[game,setGame]=useState('ttt');
 const tabs=useMemo(()=>[['ttt','Tic-Tac-Toe'],['c4','Connect Four'],['trivia','Trivia Battle'],['questions','Question Lab']],[ ]);
 return <section className="games"><div className="gamesHeader"><div><h2>Game Lounge</h2><p className="muted">Play together without leaving the room.</p></div><div className="gameTabs">{tabs.map(([id,label])=><button key={id} className={game===id?'active':''} onClick={()=>setGame(id)}>{label}</button>)}</div></div>{game==='ttt'&&<TicTacToe socket={socket} roomId={roomId} user={user}/>} {game==='c4'&&<ConnectFour socket={socket} roomId={roomId} user={user}/>} {game==='trivia'&&<Trivia socket={socket} roomId={roomId}/>} {game==='questions'&&<CustomQuestions socket={socket} roomId={roomId}/>}</section>
}
