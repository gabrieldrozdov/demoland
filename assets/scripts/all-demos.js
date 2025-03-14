const allDemos = [{'name':'Welcome to DEMOLAND','color':'var(--pink)','url':'editor/?book=tutorial&chapter=tutorial&demo=welcome'},{'name':'What is HTML?','color':'var(--green)','url':'editor/?book=tutorial&chapter=tutorial&demo=html'},{'name':'What is CSS?','color':'var(--blue)','url':'editor/?book=tutorial&chapter=tutorial&demo=css'},{'name':'What is JavaScript?','color':'var(--yellow)','url':'editor/?book=tutorial&chapter=tutorial&demo=js'},{'name':'What are JavaScript Libraries?','color':'var(--purple)','url':'editor/?book=tutorial&chapter=tutorial&demo=js-libraries'},{'name':'Starter Template','color':'var(--red)','url':'editor/?book=tutorial&chapter=tutorial&demo=template'},{'name':'Introduction','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=introduction'},{'name':'Splitting things up','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=splitting-things-up'},{'name':'Making it pretty','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=making-it-pretty'},{'name':'Programmatic poetry','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=programmatic-poetry'},{'name':'Brought to life','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=brought-to-life'},{'name':'Every click, a story','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=every-click-a-story'},{'name':'What’s next?','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-1&demo=whats-next'},{'name':'Recap','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=recap'},{'name':'HTML template','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=html-template'},{'name':'Testing code','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=testing-code'},{'name':'Variables','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=variables'},{'name':'Data types','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=data-types'},{'name':'Operators','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=operators'},{'name':'Conditionals','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=conditionals'},{'name':'Functions','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=functions'},{'name':'Side effects','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=side-effects'},{'name':'Scope','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=scope'},{'name':'Homework template','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=week-2&demo=homework-template'},{'name':'Question 1','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-1'},{'name':'Question 2','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-2'},{'name':'Question 3','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-3'},{'name':'Question 4','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-4'},{'name':'Question 5','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-5'},{'name':'Question 6','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=question-6'},{'name':'Bonus Question','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=technical-1-answers&demo=bonus-question'},{'name':'Warm Up: Poem generator','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=warm-up'},{'name':'Running functions','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=running-functions'},{'name':'Visualizing results','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=visualizing-results'},{'name':'Repeating code with loops','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=repeating-code-with-loops'},{'name':'Try It Out: “while” loops','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-while-loops'},{'name':'Try It Out: “while” loops solution','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-while-loops-solution'},{'name':'Building an interface','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=building-an-interface'},{'name':'Different kinds of loops','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=different-kinds-of-loops'},{'name':'Try It Out: “for” loops','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-for-loops'},{'name':'Try It Out: “for” loops solution','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-for-loops-solution'},{'name':'Looping through arrays','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=accessing-data-from-arrays'},{'name':'Looping through arrays','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=looping-through-arrays'},{'name':'Helper functions','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=helper-functions'},{'name':'Getting random values','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=getting-random-values'},{'name':'Try It Out: Random numbers','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-random-numbers'},{'name':'Try It Out: Random numbers solution','color':'var(--red)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=try-it-out-random-numbers-solution'},{'name':'Weekly Challenge: Funky dice','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=weekly-challenge'},{'name':'Weekly Challenge: Funky dice solution','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=week-3&demo=weekly-challenge-solution'},{'name':'Question 1','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=technical-2&demo=question-1'},{'name':'Question 2','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=technical-2&demo=question-2'},{'name':'Question 3','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=technical-2&demo=question-3'},{'name':'Question 4','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=technical-2&demo=question-4'},{'name':'Bonus Question','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=technical-2&demo=bonus-question'},{'name':'Question 1','color':'var(--pink)','url':'editor/?book=introduction-to-computation&chapter=technical-2-answers&demo=question-1'},{'name':'Question 2','color':'var(--green)','url':'editor/?book=introduction-to-computation&chapter=technical-2-answers&demo=question-2'},{'name':'Question 3','color':'var(--blue)','url':'editor/?book=introduction-to-computation&chapter=technical-2-answers&demo=question-3'},{'name':'Question 4','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=technical-2-answers&demo=question-4'},{'name':'Bonus Question','color':'var(--purple)','url':'editor/?book=introduction-to-computation&chapter=technical-2-answers&demo=bonus-question'},{'name':'The &lt;select&gt; element','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=select-element'},{'name':'Template literals','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=template-literals'},{'name':'Modifying arrays','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=modifying-arrays'},{'name':'Playing with arrays','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=playing-with-arrays'},{'name':'Modifying strings','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=modifying-strings'},{'name':'Getting data from objects','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=getting-data-from-objects'},{'name':'Modifying objects','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=modifying-objects'},{'name':'Weekly Challenge 1','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-1'},{'name':'Weekly Challenge 1 Solution','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-1-solution'},{'name':'Weekly Challenge 2','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-2'},{'name':'Weekly Challenge 2 Solution','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-2-solution'},{'name':'Weekly Challenge 3','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-3'},{'name':'Weekly Challenge 3 Solution','color':'var(--yellow)','url':'editor/?book=introduction-to-computation&chapter=week-4&demo=weekly-challenge-3-solution'},]