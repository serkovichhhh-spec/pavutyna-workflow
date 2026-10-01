import {mountWhiteboard} from './whiteboard.js';import {applyTemplate} from './whiteboard-model.js';
let board=applyTemplate({id:'demo-board',name:'Пісочниця',zoom:65,cards:[],edges:[]},'brainstorm');
const root=document.querySelector('#demo-board');function render(){mountWhiteboard(root,{board,tasks:[],notice:()=>{},save:async next=>{board=next;render();return true;}});}render();
