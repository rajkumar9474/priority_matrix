/*
  Priority Matrix – Django Version
  Features:
  - Draggable numbered token per task
  - Drop onto matrix quadrants
  - Token shows task title on hover
  - After token moved, list shows empty placeholder but retains task number and title
  - Add tasks (+) with color cycling
  - State persisted in Django database via REST API
  - User authentication required
*/

// Get CSRF token for Django
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

const csrftoken = getCookie('csrftoken');

const COLORS = [
    '#ef4444', // red
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#22c55e', // green
    '#06b6d4', // cyan
    '#f97316', // orange
    '#a855f7'  // purple
];

// Global animation controller
let animationController = null;

const state = {
    tasks: [], // {id, title, colorIndex, placedIn: null|q1|q2|q3|q4}
    nextId: 1,
    selectedTaskId: null,
    // Keep the order in which tokens are placed inside each quadrant
    zoneOrder: { q1: [], q2: [], q3: [], q4: [] },
};

const els = {
    taskList: document.getElementById('taskList'),
    addBtn: document.getElementById('addTaskBtn'),
    template: document.getElementById('taskItemTemplate'),
    zones: Array.from(document.querySelectorAll('.drop-zone')),
    completedList: document.getElementById('completedList'),
    completedCount: document.getElementById('completedCount'),
    activeCount: document.getElementById('activeCount'),
    q1Count: document.getElementById('q1Count'),
    q2Count: document.getElementById('q2Count'),
    q3Count: document.getElementById('q3Count'),
    q4Count: document.getElementById('q4Count'),
    allCount: document.getElementById('allCount'),
    tabActive: document.getElementById('tabActive'),
    tabCompleted: document.getElementById('tabCompleted'),
    tabQ1: document.getElementById('tabQ1'),
    tabQ2: document.getElementById('tabQ2'),
    tabQ3: document.getElementById('tabQ3'),
    tabQ4: document.getElementById('tabQ4'),
    tabAll: document.getElementById('tabAll'),
    panelActive: document.getElementById('panelActive'),
    panelCompleted: document.getElementById('panelCompleted'),
    panelQ1: document.getElementById('panelQ1'),
    panelQ2: document.getElementById('panelQ2'),
    panelQ3: document.getElementById('panelQ3'),
    panelQ4: document.getElementById('panelQ4'),
    panelAll: document.getElementById('panelAll'),
    q1List: document.getElementById('q1List'),
    q2List: document.getElementById('q2List'),
    q3List: document.getElementById('q3List'),
    q4List: document.getElementById('q4List'),
    allList: document.getElementById('allList'),
};

// Runtime helpers for drag insertion
const dragState = {
    placeholder: null,
    targetZone: null,
    insertIndex: 0,
    dragId: null,
};

// --- Persistence with Django API ---
const loadFromAPI = async () => {
    try {
        const response = await fetch('/api/tasks/', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = '/login/';
                return;
            }
            throw new Error('Failed to load tasks');
        }
        
        const tasks = await response.json();
        
        // Convert Django task format to our state format
        state.tasks = tasks.map(task => ({
            id: task.id,
            title: task.title,
            colorIndex: task.color_index,
            placedIn: task.placed_in,
            completed: task.completed
        }));
        
        // Calculate nextId
        state.nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
        
        // Build zone order from tasks
        const z = { q1: [], q2: [], q3: [], q4: [] };
        tasks
            .filter(t => t.placed_in && z[t.placed_in])
            .sort((a, b) => a.order_in_zone - b.order_in_zone)
            .forEach(t => z[t.placed_in].push(t.id));
        state.zoneOrder = z;
        
        render();
    } catch (error) {
        console.error('Error loading tasks:', error);
        seed();
    }
};

const load = loadFromAPI;

const saveToAPI = async () => {
    try {
        // Update all tasks with their current state
        const updates = state.tasks.map(task => {
            const zone = task.placedIn;
            const orderInZone = zone ? state.zoneOrder[zone].indexOf(task.id) : 0;
            
            return {
                id: task.id,
                title: task.title,
                color_index: task.colorIndex,
                placed_in: task.placedIn,
                completed: task.completed,
                order_in_zone: orderInZone
            };
        });
        
        // Send bulk update
        const response = await fetch('/api/tasks/bulk-update/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin',
            body: JSON.stringify({ tasks: updates })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save tasks');
        }
    } catch (error) {
        console.error('Error saving tasks:', error);
    }
};

const save = saveToAPI;

// Seed with a few example tasks (creates them via API)
async function seed() {
    const seedTasks = [
        { title: 'Study for sem', colorIndex: 0, placedIn: null, completed: false },
        { title: 'Writing practical', colorIndex: 3, placedIn: null, completed: false },
        { title: 'Buy groceries', colorIndex: 1, placedIn: null, completed: false },
        { title: 'Play game', colorIndex: 2, placedIn: null, completed: false },
    ];
    
    for (const taskData of seedTasks) {
        await createTaskAPI(taskData);
    }
    
    await loadFromAPI();
}

// Create a new task via API
async function createTaskAPI(taskData) {
    try {
        const response = await fetch('/api/tasks/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                title: taskData.title,
                color_index: taskData.colorIndex,
                placed_in: taskData.placedIn,
                completed: taskData.completed || false,
                order_in_zone: 0
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create task');
        }
        
        const newTask = await response.json();
        
        // Add to local state
        state.tasks.push({
            id: newTask.id,
            title: newTask.title,
            colorIndex: newTask.color_index,
            placedIn: newTask.placed_in,
            completed: newTask.completed
        });
        
        return newTask;
    } catch (error) {
        console.error('Error creating task:', error);
        return null;
    }
}

// Update a task via API
async function updateTaskAPI(taskId, updates) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin',
            body: JSON.stringify(updates)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update task');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating task:', error);
        return null;
    }
}

// Delete a task via API
async function deleteTaskAPI(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete task');
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting task:', error);
        return false;
    }
}

// --- Rendering ---
function buildRow(task, displayNumber){
    const li = els.template.content.firstElementChild.cloneNode(true);
    li.dataset.id = task.id;
    const token = li.querySelector('.token');
    const titleEl = li.querySelector('.task-title');
    const numEl = li.querySelector('.task-number');
    const editBtn = li.querySelector('.edit-btn');
    const doneBtn = li.querySelector('.done-btn');
    const deleteBtn = li.querySelector('.delete-btn');
    titleEl.textContent = task.title;
    function finishEdit(commit){
        if (commit){
            applyTitleEdit(task, titleEl.textContent);
        } else {
            titleEl.textContent = task.title;
        }
        titleEl.contentEditable = 'false';
        li.classList.remove('editing');
    }
    titleEl.addEventListener('blur', () => finishEdit(true));
    titleEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter'){ e.preventDefault(); titleEl.blur(); }
        if (e.key === 'Escape'){ e.preventDefault(); finishEdit(false); titleEl.blur(); }
    });
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        titleEl.contentEditable = 'true';
        li.classList.add('editing');
        state.selectedTaskId = null;
        setTimeout(()=> {
            titleEl.focus();
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(titleEl);
                range.collapse(false);
                sel.addRange(range);
            }
        }, 0);
    });
    titleEl.addEventListener('mousedown', (e)=>{ if (li.classList.contains('editing')) e.stopPropagation(); });
    li.addEventListener('click', (e) => {
        if (li.classList.contains('editing')) return;
        const trg = e.target;
        if (trg && (trg.closest('.edit-btn') || trg.closest('.task-title'))) return;
        state.selectedTaskId = (state.selectedTaskId === task.id) ? null : task.id;
        render();
    });
    numEl.textContent = `#${displayNumber}`;
    token.style.background = COLORS[task.colorIndex % COLORS.length];
    token.textContent = displayNumber;
    token.dataset.taskId = String(task.id);
    if (task.placedIn) li.classList.add('empty');
    if (state.selectedTaskId === task.id) li.classList.add('selected');
    if (task.completed) li.classList.add('completed');
    if (!task.completed){
        token.addEventListener('dragstart', (ev) => onDragStart(ev, task));
        token.addEventListener('dragend', (ev) => {
            if (animationController) {
                animationController.animateTokenDragEnd(ev.target);
            }
        });
    }
    if (task.placedIn && !task.completed){
        li.addEventListener('dragover', (e) => {
            if (dragState.dragId === task.id) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                li.classList.add('drag-over');
            } else {
                li.classList.remove('drag-over');
            }
        });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', (e) => {
            if (dragState.dragId !== task.id) return;
            e.preventDefault();
            
            // Get the dragged token element for animation
            const draggedTokenElement = document.querySelector(`[data-task-id="${task.id}"]`);
            
            if (animationController && draggedTokenElement && task.placedIn) {
                // Animate token returning to task list
                animationController.animateTokenReturn(draggedTokenElement, li, () => {
                    // Remove from matrix after animation
                    task.placedIn = null;
                    removeFromAllOrders(task.id);
                    save();
                    render();
                });
            } else {
                // Fallback without animation
                task.placedIn = null;
                removeFromAllOrders(task.id);
                save();
                render();
            }
        });
    }
    if (doneBtn){
        doneBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCompleted(task); });
    }
    if (deleteBtn){
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); attemptDeleteTask(task.id); });
    }
    return li;
}

function render() {
    els.taskList.innerHTML = '';
    if (els.completedList) els.completedList.innerHTML = '';
    if (els.q1List) els.q1List.innerHTML = '';
    if (els.q2List) els.q2List.innerHTML = '';
    if (els.q3List) els.q3List.innerHTML = '';
    if (els.q4List) els.q4List.innerHTML = '';
    if (els.allList) els.allList.innerHTML = '';
    const unplacedActive = [];
    const completedRows = [];
    const placedRows = { q1: new Map(), q2: new Map(), q3: new Map(), q4: new Map() };
    const allRows = [];
    
    // Create a mapping of task ID to display number (1-indexed)
    const taskDisplayNumbers = new Map();
    state.tasks.forEach((task, index) => {
        taskDisplayNumbers.set(task.id, index + 1);
    });
    
    state.tasks.forEach(task => {
        const displayNum = taskDisplayNumbers.get(task.id);
        const li = buildRow(task, displayNum);
        const liAll = buildRow(task, displayNum); // independent row for All list
        allRows.push(liAll);
        if (task.completed){
            completedRows.push(li);
        } else if (!task.placedIn){
            unplacedActive.push(li);
        } else {
            if (placedRows[task.placedIn]) placedRows[task.placedIn].set(task.id, li);
            else unplacedActive.push(li);
        }
    });

    // Attach completed
    if (els.completedList){
        completedRows.forEach(li => {
            els.completedList.appendChild(li);
        });
    }
    
    // Attach unplaced active
    unplacedActive.forEach(li => {
        els.taskList.appendChild(li);
    });

    // render tokens in zones and attach placed rows in zone order
    els.zones.forEach(z => z.innerHTML = '');
    const zones = ['q1','q2','q3','q4'];
    zones.forEach(key => {
        const zone = document.querySelector(`.drop-zone[data-zone="${key}"]`);
        if (!zone) return;
        const cleaned = [];
        state.zoneOrder[key].forEach(id => {
            const task = state.tasks.find(t => t.id === id && t.placedIn === key);
            if (task) {
                const displayNum = taskDisplayNumbers.get(task.id);
                zone.appendChild(makeMatrixToken(task, displayNum));
                cleaned.push(id);
            }
        });
        // remove any stale ids silently
        state.zoneOrder[key] = cleaned;
        // Append placed rows for this zone in the same order
        const targetList = { q1: els.q1List, q2: els.q2List, q3: els.q3List, q4: els.q4List }[key];
        if (targetList && placedRows[key]){
            cleaned.forEach(id => {
                const li = placedRows[key].get(id);
                if (li) {
                    targetList.appendChild(li);
                }
                // remove from map after use
                placedRows[key].delete(id);
            });
            // Append any remaining (not in zoneOrder yet) in id order for stability
            Array.from(placedRows[key].entries())
                .sort((a,b)=> a[0]-b[0])
                .forEach(([_, li]) => {
                    targetList.appendChild(li);
                });
            placedRows[key].clear();
        }
    });
    
    // Update completed count/label each render
    updateCompletedPanelMeta();
    updateAllCounts();
    if (els.allList) {
        // Populate All Tasks list with every task
        allRows.forEach(li => {
            els.allList.appendChild(li);
        });
    }
    
    // Setup quadrant hover animations after render
    if (animationController) {
        animationController.setupQuadrantHovers();
    }
}

function makeMatrixToken(task, displayNumber) {
    const div = document.createElement('div');
    div.className = 'token';
    div.style.background = COLORS[task.colorIndex % COLORS.length];
    div.textContent = displayNumber;
    div.draggable = true; // allow re-drag across quadrants
    div.dataset.taskId = String(task.id);
    div.dataset.title = task.title;
    div.addEventListener('dragstart', (ev) => onDragStart(ev, task));
    div.addEventListener('dragend', (ev) => {
        if (animationController) {
            animationController.animateTokenDragEnd(ev.target);
        }
    });
    // Jump to the task row on double click from the matrix
    div.addEventListener('dblclick', () => {
        state.selectedTaskId = task.id;
        render();
        // Switch to relevant tab first, then reveal row
        autoSwitchForTask(task);
        requestAnimationFrame(() => revealTaskRow(task.id));
    });
    // Shift+Click to toggle done quickly
    div.addEventListener('click', (ev) => {
        if (ev.shiftKey) {
            ev.stopPropagation();
            toggleCompleted(task);
        }
    });
    // Right-click context menu on token
    div.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showTokenContextMenu(task, ev.clientX, ev.clientY);
    });
    // Small overlay delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'token-delete';
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label','Delete task');
    delBtn.title = 'Delete';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attemptDeleteTask(task.id);
    });
    // Prevent starting drag when clicking delete
    delBtn.addEventListener('mousedown', (e)=> e.stopPropagation());
    div.appendChild(delBtn);
    return div;
}

function onDragStart(ev, task) {
    ev.dataTransfer.setData('text/plain', String(task.id));
    ev.dataTransfer.effectAllowed = 'move';
    dragState.dragId = task.id;
    
    // Add GSAP drag start animation
    const tokenElement = ev.target;
    if (animationController) {
        animationController.animateTokenDragStart(tokenElement);
    }
}

function removeFromAllOrders(id){
    ['q1','q2','q3','q4'].forEach(k => {
        const arr = state.zoneOrder[k];
        const idx = arr.indexOf(id);
        if (idx !== -1) arr.splice(idx,1);
    });
}

// Drop behavior
els.zones.forEach(zone => {
    zone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        // Calculate insertion index based on pointer position
        const idx = computeInsertIndex(zone, ev.clientX, ev.clientY);
        showPlaceholder(zone, idx);
    });
        zone.addEventListener('dragenter', (ev) => {
                const q = zone.closest('.quadrant');
                if (q) q.classList.add('drag-over');
        });
    zone.addEventListener('dragleave', (ev) => {
                const q = zone.closest('.quadrant');
                if (q) q.classList.remove('drag-over');
        // Remove placeholder when leaving the zone entirely
        if (!zone.contains(ev.relatedTarget)) removePlaceholder();
        });
        zone.addEventListener('drop', (ev) => {
                ev.preventDefault();
                const id = Number(ev.dataTransfer.getData('text/plain'));
                const task = state.tasks.find(t => t.id === id);
                if (!task) return;
                
                // set placedIn to this zone id
        const targetZone = zone.dataset.zone;
        const index = (dragState.targetZone === zone && typeof dragState.insertIndex === 'number')
            ? dragState.insertIndex : computeInsertIndex(zone, ev.clientX, ev.clientY);
        removeFromAllOrders(id);
        if (targetZone && state.zoneOrder[targetZone]) {
            const arr = state.zoneOrder[targetZone];
            const clamped = Math.max(0, Math.min(index, arr.length));
            arr.splice(clamped, 0, id);
        }
        
        const oldPlacedIn = task.placedIn;
        task.placedIn = targetZone;
        
        const q = zone.closest('.quadrant');
        if (q) q.classList.remove('drag-over');
        removePlaceholder();
        
        // Ensure a token element exists in DOM for animation (create if new placement)
        let tokenElement = document.querySelector(`[data-task-id="${id}"]`);
        const isNewPlacement = !oldPlacedIn || oldPlacedIn !== targetZone;
        if (isNewPlacement && !tokenElement) {
            // Temporarily create a hidden token in the target zone so final position exists
            const tempToken = makeMatrixToken(task);
            tempToken.style.opacity = '0';
            zone.appendChild(tempToken);
            tokenElement = tempToken;
        }

        const finalize = () => {
            save();
            render();
            if (animationController && animationController.showNotification) {
                animationController.showNotification(`Task moved to ${getQuadrantName(targetZone)}!`, 'success');
            }
        };

        if (animationController && tokenElement && q) {
            if (isNewPlacement) {
                // Run travel animation using cloned element effect
                animationController.animateTokenDrop(tokenElement, q, () => finalize());
            } else {
                // Same quadrant reorder – minimal work
                finalize();
                animationController.animateTokenDragEnd(tokenElement);
            }
        } else {
            finalize();
        }
        
        dragState.dragId = null;
        });
});

// Inline add UI
function showInlineAdd(){
    const wrapper = document.getElementById('addControl');
    if (!wrapper) return;
    if (wrapper.querySelector('form')) return; // already open
    const form = document.createElement('form');
    form.id = 'addForm';
    form.className = 'inline-add-form';
    form.innerHTML = `
        <input id="newTaskTitle" type="text" placeholder="New task title" aria-label="New task title" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" name="task_${Date.now()}" />
        <button type="submit" class="primary">Add</button>
        <button type="button" id="cancelAdd" class="secondary">Cancel</button>
    `;
    wrapper.innerHTML = '';
    wrapper.appendChild(form);
    const input = form.querySelector('#newTaskTitle');
    input.focus();
    form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const title = input.value.trim();
        if(!title) return;
        
        // Create task via API
        const newTask = await createTaskAPI({
            title,
            colorIndex: state.tasks.length % COLORS.length,
            placedIn: null,
            completed: false
        });
        
        if (!newTask) {
            alert('Failed to create task. Please try again.');
            return;
        }
        
        // Select newly added task
        state.selectedTaskId = newTask.id;
        render();
        
        // Add creation notification
        if (animationController) {
            animationController.showNotification(`Task "${title}" created!`, 'success');
        }
        
        // Flash & scroll using existing reveal helper
        requestAnimationFrame(()=> {
            revealTaskRow(newTask.id);
            // Animate the newly added task
            const newTaskElement = document.querySelector(`[data-id="${newTask.id}"]`);
            if (newTaskElement && animationController) {
                animationController.animateTaskAdd(newTaskElement);
            }
        });
        restoreAddButton();
    });
    form.querySelector('#cancelAdd').addEventListener('click', restoreAddButton);
}

function restoreAddButton(){
    const wrapper = document.getElementById('addControl');
    if (!wrapper) return;
    wrapper.innerHTML = '<button id="addTaskBtn" type="button" class="add-btn">+ Add</button>';
    els.addBtn = document.getElementById('addTaskBtn');
    bindInlineAdd();
}

function bindInlineAdd(){
    if (!els.addBtn) return;
    els.addBtn.addEventListener('click', showInlineAdd, { once:true });
}

bindInlineAdd();
bindTabs();

// remove earlier helper remnants (not used anymore)

// Per-row return: handled within render for empty rows matching dragged token id

// Init - Load data from API
(async () => {
    await load();
    render();
})();


// --- Dynamic square sizing to also fit viewport height ---
function updateMatrixSizing(){
    // Get all the elements we need for calculations
    const header = document.querySelector('header');
    const layout = document.querySelector('.layout');
    const matrix = document.querySelector('.matrix');
    
    if (!header || !layout || !matrix) return;
    
    // Calculate precise measurements
    const headerH = header.getBoundingClientRect().height;
    const isMobile = window.innerWidth <= 900;
    
    let finalSize;
    
    if (isMobile) {
        // Mobile sizing: use smaller dimension and leave space for tasks
        const layoutPadding = 32; // 1rem * 2 = 32px on mobile
        const matrixPadding = 24; // 0.75rem * 2 = 24px
        const tasksPanelHeight = 200; // Approximate height for tasks panel
        const safetyMargin = 40; // Extra margin for mobile
        
        const availableHeight = window.innerHeight - headerH - layoutPadding - matrixPadding - tasksPanelHeight - safetyMargin;
        const availableWidth = window.innerWidth - layoutPadding - matrixPadding;
        
        // Use the smaller dimension to ensure it fits
        const constrainedSize = Math.min(availableWidth, availableHeight);
        finalSize = Math.max(250, Math.min(constrainedSize, 400)); // 250px min, 400px max on mobile
        
    } else {
        // Desktop sizing
        const layoutPadding = 40; // 1.25rem * 2 = 40px
        const matrixPadding = 24; // 0.75rem * 2 = 24px
        const safetyMargin = 20; // Extra margin for safety
        
        // Calculate available height (viewport minus header, padding, and margins)
        const availableHeight = window.innerHeight - headerH - layoutPadding - matrixPadding - safetyMargin;
        
        // Calculate available width (60% of layout width minus gap)
        const layoutWidth = layout.clientWidth || window.innerWidth - layoutPadding;
        const layoutGap = 20; // 1.25rem gap between matrix and tasks
        const availableWidth = (layoutWidth - layoutGap) * 0.6; // 60% for matrix
        
        // The matrix should be square, so use the smaller of width/height constraints
        const constrainedSize = Math.min(availableWidth, availableHeight);
        
        // Set minimum and maximum bounds
        const minSize = 280; // Minimum usable size
        const maxSize = Math.min(window.innerWidth - 60, window.innerHeight - headerH - 60);
        
        // Final size calculation
        finalSize = Math.max(minSize, Math.min(constrainedSize, maxSize));
    }
    
    // Apply the calculated size
    document.documentElement.style.setProperty('--matrixSide', finalSize + 'px');
    document.documentElement.style.setProperty('--matrixMaxH', (window.innerHeight - headerH - 100) + 'px');
    document.documentElement.style.setProperty('--availableViewHeight', (window.innerHeight - headerH - 100) + 'px');
    
    // Force the matrix to be exactly square by setting both width and height
    matrix.style.width = finalSize + 'px';
    matrix.style.height = finalSize + 'px';
    matrix.style.flexBasis = finalSize + 'px';
    matrix.style.minWidth = finalSize + 'px';
    matrix.style.minHeight = finalSize + 'px';
    matrix.style.maxWidth = finalSize + 'px';
    matrix.style.maxHeight = finalSize + 'px';
}

updateMatrixSizing();
window.addEventListener('resize', () => {
    // Debounce the resize event to avoid excessive calls
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(updateMatrixSizing, 100);
});

// Also update matrix sizing when orientation changes (mobile)
window.addEventListener('orientationchange', () => {
    // Delay to allow orientation change to complete and dimensions to settle
    setTimeout(updateMatrixSizing, 300);
});

// Ensure sizing is correct after page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateMatrixSizing, 100);
});

// Keep tasks panel within viewport and make list scroll
function updateTasksMaxHeight(){
    const header = document.querySelector('header');
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const paddingAllowance = 40; // account for page padding and panel radius
    const available = Math.max(300, window.innerHeight - headerH - paddingAllowance);
    document.documentElement.style.setProperty('--tasksMaxH', available + 'px');
}

updateTasksMaxHeight();
window.addEventListener('resize', updateTasksMaxHeight);

// Clean any drag-over class at end of drag
document.addEventListener('dragend', () => {
    document.querySelectorAll('.quadrant.drag-over').forEach(el => el.classList.remove('drag-over'));
    removePlaceholder();
    dragState.dragId = null;
    // Clear any row drag-over states
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'));
});

// Keyboard alternative: select a task in the list then press 1-4 to move, 0 to return to list
document.addEventListener('keydown', (e) => {
    if (!state.selectedTaskId) return;
    const map = { '1':'q1', '2':'q2', '3':'q3', '4':'q4' };
    // Do not trigger shortcuts while typing in an editable field
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    if (map[e.key]) {
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (task) {
            const target = map[e.key];
            removeFromAllOrders(task.id);
            state.zoneOrder[target].push(task.id);
            task.placedIn = target;
            save();
            render();
        }
    } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (task) {
            task.placedIn = null;
            removeFromAllOrders(task.id);
            save();
            render();
        }
    } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Space toggles completion
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (task) {
            toggleCompleted(task);
        }
    } else if (e.key === 'F2') {
        // Quick rename shortcut now behaves like clicking edit button
        const li = document.querySelector(`.task-item[data-id="${state.selectedTaskId}"]`);
        if (li){
            const titleEl = li.querySelector('.task-title');
            if (titleEl){
                titleEl.contentEditable = 'true';
                li.classList.add('editing');
                state.selectedTaskId = null; // prevent global Backspace/Delete
                startEditingTaskTitle(state.selectedTaskId);
            }
        }
    }
});

// --- Editing helpers ---
function applyTitleEdit(task, raw){
    const newTitle = (raw || '').trim() || `Task ${task.id}`;
    task.title = newTitle;
    // Update tooltip on any placed token immediately
    const node = document.querySelector(`.token[data-task-id="${task.id}"]`);
    if (node) node.dataset.title = newTitle;
    save();
}

function startEditingTaskTitle(taskId){
    if (!taskId) return;
    const li = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (!li) return;
    const span = li.querySelector('.task-title');
    if (!span) return;
    // Focus and select all content
    span.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(range);
}

// Removed right-click rename prompt for tokens

// --- Insertion helpers for wrapped flex zones ---
function computeInsertIndex(zone, x, y){
    const tokens = Array.from(zone.querySelectorAll('.token'))
        .filter(el => Number(el.dataset.taskId) !== dragState.dragId);
    if (tokens.length === 0) return 0;
    // Build visual order (top to bottom, then left to right)
    const items = tokens.map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
            el,
            index: i,
            left: r.left,
            top: r.top,
            cx: r.left + r.width/2,
            cy: r.top + r.height/2
        };
    }).sort((a,b)=> a.top === b.top ? a.left - b.left : a.top - b.top);

    // Nearest center heuristic
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i=0;i<items.length;i++){
        const it = items[i];
        const dx = x - it.cx;
        const dy = y - it.cy;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestDist){
            bestDist = d2;
            bestIdx = i;
        }
    }
    const nearest = items[bestIdx];
    const before = x < nearest.cx; // left side of nearest -> before
    // Convert visual order index to DOM order index among tokens
    const visualToDom = (el)=> tokens.indexOf(el);
    const domIdx = visualToDom(nearest.el);
    return before ? domIdx : domIdx + 1;
}

function showPlaceholder(zone, index){
    if (!dragState.placeholder){
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        ph.setAttribute('data-placeholder','1');
        dragState.placeholder = ph;
    }
    dragState.targetZone = zone;
    dragState.insertIndex = index;
    const tokens = Array.from(zone.querySelectorAll('.token'))
        .filter(el => Number(el.dataset.taskId) !== dragState.dragId);
    const ref = tokens[index] || null;
    if (ref && ref === dragState.placeholder.nextSibling) return; // already placed
    if (dragState.placeholder.parentElement !== zone || ref !== dragState.placeholder.nextSibling){
        zone.insertBefore(dragState.placeholder, ref);
    }
}

function removePlaceholder(){
    if (dragState.placeholder && dragState.placeholder.parentElement){
        dragState.placeholder.parentElement.removeChild(dragState.placeholder);
    }
    dragState.targetZone = null;
    dragState.insertIndex = 0;
}

// --- Reveal helper: scroll the matching task row into view and highlight it
function revealTaskRow(taskId){
    const li = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (!li) return;
    // Ensure the row is visible in the scrollable list
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash a quick highlight to draw attention
    li.classList.add('revealed');
    // Remove the helper class after animation
    setTimeout(() => li.classList.remove('revealed'), 1200);
}

// --- Completed handling ---
function toggleCompleted(task){
    const taskElement = document.querySelector(`[data-id="${task.id}"]`);
    
    task.completed = !task.completed;
    if (task.completed){
        // Add completion animation before processing
        if (animationController && taskElement) {
            animationController.animateTaskComplete(taskElement);
            animationController.showNotification('Task completed! 🎉', 'success');
        }
        
        // Remove from matrix if placed
        if (task.placedIn){
            removeFromAllOrders(task.id);
        }
        task.placedIn = null;
        // Clear selection if completing current
        if (state.selectedTaskId === task.id) state.selectedTaskId = null;
    } else {
        // Task uncompleted
        if (animationController) {
            animationController.showNotification('Task restored to active!', 'info');
        }
    }
    save();
    render();
    autoSwitchForTask(task);
    // After marking done/undone, scroll it into view for feedback
    requestAnimationFrame(()=> revealTaskRow(task.id));
    updateCompletedPanelMeta();
}

// --- Token context menu ---
let tokenMenuEl = null;
function showTokenContextMenu(task, x, y){
    hideTokenContextMenu();
    const menu = document.createElement('div');
    menu.id = 'tokenMenu';
    menu.className = 'token-menu';
    menu.innerHTML = `
        <button class="menu-item" data-action="toggle">${task.completed ? 'Mark as Not Done' : 'Mark as Done'}</button>
        <button class="menu-item" data-action="reveal">Find in list</button>
        <button class="menu-item danger" data-action="delete">Delete task</button>
    `;
    document.body.appendChild(menu);
    tokenMenuEl = menu;
    // Position within viewport
    const pad = 8;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - pad);
    const top = Math.min(y, window.innerHeight - rect.height - pad);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    const onClick = (ev) => {
        const btn = ev.target.closest('.menu-item');
        if (!btn) return;
        const act = btn.dataset.action;
        if (act === 'toggle') {
            toggleCompleted(task);
        } else if (act === 'reveal') {
            state.selectedTaskId = task.id;
            render();
            autoSwitchForTask(task);
            requestAnimationFrame(()=> revealTaskRow(task.id));
        } else if (act === 'delete') {
            attemptDeleteTask(task.id);
        }
        hideTokenContextMenu();
    };
    menu.addEventListener('click', onClick, { once:false });

    const closeOnOutside = (ev) => {
        if (tokenMenuEl && !tokenMenuEl.contains(ev.target)) hideTokenContextMenu();
    };
    const closeOnEsc = (ev) => { if (ev.key === 'Escape') hideTokenContextMenu(); };
    const closeOnScroll = () => hideTokenContextMenu();
    setTimeout(()=>{
        document.addEventListener('click', closeOnOutside, { once:true });
        document.addEventListener('keydown', closeOnEsc, { once:true });
        window.addEventListener('scroll', closeOnScroll, { once:true });
    }, 0);
}

function hideTokenContextMenu(){
    if (tokenMenuEl && tokenMenuEl.parentElement){
        tokenMenuEl.parentElement.removeChild(tokenMenuEl);
    }
    tokenMenuEl = null;
}

// --- Delete helpers ---
function attemptDeleteTask(id){
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    const displayNum = taskIndex + 1;
    const title = task.title || `Task ${displayNum}`;
    const ok = confirm(`Delete #${displayNum}: ${title}? This cannot be undone.`);
    if (!ok) return;
    deleteTask(id);
}

function deleteTask(id){
    const taskElement = document.querySelector(`[data-id="${id}"]`);
    
    // Animate deletion before removing
    if (animationController && taskElement) {
        animationController.animateTaskDelete(taskElement, () => {
            // Callback after animation completes
            performTaskDeletion(id);
        });
    } else {
        performTaskDeletion(id);
    }
}

async function performTaskDeletion(id) {
    // Delete from API
    const success = await deleteTaskAPI(id);
    if (!success) {
        alert('Failed to delete task. Please try again.');
        return;
    }
    
    removeFromAllOrders(id);
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx !== -1) state.tasks.splice(idx,1);
    if (state.selectedTaskId === id) state.selectedTaskId = null;
    render();
    updateCompletedPanelMeta();
    
    if (animationController) {
        animationController.showNotification('Task deleted!', 'info');
    }
}

// Helper function to get quadrant names
function getQuadrantName(quadrant) {
    const names = {
        q1: 'Urgent & Important',
        q2: 'Important • Not Urgent', 
        q3: 'Urgent • Not Important',
        q4: 'Not Urgent • Not Important'
    };
    return names[quadrant] || 'Unknown';
}

// Compact ids to 1..n and update all references (zoneOrder, selection)
// No longer needed - Django handles task IDs
function renumberTasks(){
    // Django manages IDs automatically, no renumbering needed
}


// Update counts and button label for completed panel
function updateCompletedPanelMeta(){
    if (!els.completedCount) return;
    const count = state.tasks.filter(t => t.completed).length;
    els.completedCount.textContent = String(count);
    if (els.completedList && count === 0){
        els.completedList.innerHTML = '<li class="completed-empty">No completed tasks yet.</li>';
    }
}

// Update counts for Active and Quadrants
function updateAllCounts(){
    const active = state.tasks.filter(t => !t.completed && !t.placedIn).length;
    const q1 = state.tasks.filter(t => !t.completed && t.placedIn === 'q1').length;
    const q2 = state.tasks.filter(t => !t.completed && t.placedIn === 'q2').length;
    const q3 = state.tasks.filter(t => !t.completed && t.placedIn === 'q3').length;
    const q4 = state.tasks.filter(t => !t.completed && t.placedIn === 'q4').length;
    const all = state.tasks.length;
    if (els.activeCount) els.activeCount.textContent = String(active);
    if (els.q1Count) els.q1Count.textContent = String(q1);
    if (els.q2Count) els.q2Count.textContent = String(q2);
    if (els.q3Count) els.q3Count.textContent = String(q3);
    if (els.q4Count) els.q4Count.textContent = String(q4);
    if (els.allCount) els.allCount.textContent = String(all);
}

// --- Tabs wiring ---
function activateTab(tabKey){
    // All tabs & panels
    const tabEls = [els.tabActive, els.tabCompleted, els.tabQ1, els.tabQ2, els.tabQ3, els.tabQ4, els.tabAll].filter(Boolean);
    const panelMap = {
        active: els.panelActive,
        completed: els.panelCompleted,
        q1: els.panelQ1,
        q2: els.panelQ2,
        q3: els.panelQ3,
        q4: els.panelQ4,
        all: els.panelAll
    };
    const tabMap = {
        active: els.tabActive,
        completed: els.tabCompleted,
        q1: els.tabQ1,
        q2: els.tabQ2,
        q3: els.tabQ3,
        q4: els.tabQ4,
        all: els.tabAll
    };
    
    // Find current active tab and panel
    const currentActiveTab = tabEls.find(tab => tab?.classList.contains('active'));
    const currentActivePanel = Object.values(panelMap).find(panel => panel && !panel.classList.contains('hidden'));
    
    tabEls.forEach(btn => {
        if (!btn) return;
        btn.classList.remove('active');
        btn.setAttribute('aria-selected','false');
    });
    Object.values(panelMap).forEach(panel => {
        if (!panel) return;
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden','true');
    });
    const activeTabEl = tabMap[tabKey];
    const activePanelEl = panelMap[tabKey];
    if (activeTabEl){
        activeTabEl.classList.add('active');
        activeTabEl.setAttribute('aria-selected','true');
    }
    if (activePanelEl){
        activePanelEl.classList.remove('hidden');
        activePanelEl.removeAttribute('aria-hidden');
    }
    
    // Add GSAP tab switching animation
    if (animationController && currentActiveTab && activeTabEl && currentActiveTab !== activeTabEl) {
        animationController.animateTabSwitch(currentActivePanel, activePanelEl, currentActiveTab, activeTabEl);
    }
    
    localStorage.setItem('eisenhower-tab', tabKey);
}

function bindTabs(){
    const mapping = {
        tabActive: 'active',
        tabCompleted: 'completed',
        tabQ1: 'q1',
        tabQ2: 'q2',
        tabQ3: 'q3',
        tabQ4: 'q4',
        tabAll: 'all'
    };
    Object.entries(mapping).forEach(([elKey, tabKey]) => {
        const el = els[elKey];
        if (el){
            el.addEventListener('click', () => activateTab(tabKey));
        }
    });
    const saved = localStorage.getItem('eisenhower-tab');
    const valid = ['active','completed','q1','q2','q3','q4','all'];
    activateTab(valid.includes(saved) ? saved : 'active');
}

// Auto switch to relevant tab when revealing
function autoSwitchForTask(task){
    if (!task){
        activateTab('active');
        return;
    }
    if (task.completed){
        activateTab('completed');
    } else if (task.placedIn){
        activateTab(task.placedIn);
    } else {
        activateTab('active');
    }
}

// Toggle panel visibility
function bindCompletedToggle(){
    if (!els.completedToggle || !els.completedWrapper) return;
    els.completedToggle.addEventListener('click', () => {
        const isHidden = els.completedWrapper.hasAttribute('hidden');
        if (isHidden){
            els.completedWrapper.removeAttribute('hidden');
            els.completedToggle.setAttribute('aria-expanded','true');
        } else {
            els.completedWrapper.setAttribute('hidden','');
            els.completedToggle.setAttribute('aria-expanded','false');
        }
    });
}

updateCompletedPanelMeta();

// ===== SETTINGS FUNCTIONALITY =====

// Settings state and defaults
const settingsDefaults = {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    primaryColor: '#2563eb',
    accentColor: '#10b981',
    backgroundColor: '#0b1220',
    textColor: '#e2e8f0',
    panelColor: '#0f172a',
    borderRadius: 12,
    spacing: 1,
    taskHeight: 56,
    compactMode: false,
    showNumbers: true,
    customCSS: '',
    theme: 'dark'
};

let currentSettings = { ...settingsDefaults };

// Settings modal elements
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettings');
const cancelSettingsBtn = document.getElementById('cancelSettings');
const settingsBackdrop = document.querySelector('.settings-backdrop');

// Settings tab functionality
function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPanel = tab.dataset.tab;
            
            // Remove active from all tabs and panels
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab and corresponding panel
            tab.classList.add('active');
            const panel = document.querySelector(`[data-panel="${targetPanel}"]`);
            if (panel) panel.classList.add('active');
        });
    });
}

// Show/hide settings modal
function showSettingsModal() {
    loadSettingsFromStorage();
    populateSettingsForm();
    settingsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Use GSAP animation for opening
    if (animationController) {
        animationController.animateSettingsOpen();
    }
}

function hideSettingsModal() {
    if (animationController) {
        animationController.animateSettingsClose(() => {
            settingsModal.classList.add('hidden');
            document.body.style.overflow = '';
        });
    } else {
        settingsModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Load settings from localStorage
function loadSettingsFromStorage() {
    try {
        const stored = localStorage.getItem('eisenhower-settings');
        if (stored) {
            currentSettings = { ...settingsDefaults, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
        currentSettings = { ...settingsDefaults };
    }
}

// Save settings to localStorage
function saveSettingsToStorage() {
    try {
        localStorage.setItem('eisenhower-settings', JSON.stringify(currentSettings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// Populate form with current settings
function populateSettingsForm() {
    // Typography
    document.getElementById('fontSize').value = currentSettings.fontSize;
    document.getElementById('fontWeight').value = currentSettings.fontWeight;
    document.getElementById('lineHeight').value = currentSettings.lineHeight;
    document.getElementById('letterSpacing').value = currentSettings.letterSpacing;
    
    // Colors
    document.getElementById('primaryColor').value = currentSettings.primaryColor;
    document.getElementById('primaryColorText').value = currentSettings.primaryColor;
    document.getElementById('accentColor').value = currentSettings.accentColor;
    document.getElementById('accentColorText').value = currentSettings.accentColor;
    document.getElementById('backgroundColor').value = currentSettings.backgroundColor;
    document.getElementById('backgroundColorText').value = currentSettings.backgroundColor;
    document.getElementById('textColor').value = currentSettings.textColor;
    document.getElementById('textColorText').value = currentSettings.textColor;
    document.getElementById('panelColor').value = currentSettings.panelColor;
    document.getElementById('panelColorText').value = currentSettings.panelColor;
    
    // Layout
    document.getElementById('borderRadius').value = currentSettings.borderRadius;
    document.getElementById('spacing').value = currentSettings.spacing;
    document.getElementById('taskHeight').value = currentSettings.taskHeight;
    document.getElementById('compactMode').checked = currentSettings.compactMode;
    document.getElementById('showNumbers').checked = currentSettings.showNumbers;
    
    // Advanced
    document.getElementById('customCSS').value = currentSettings.customCSS;
    
    // Theme presets
    document.querySelectorAll('.theme-preset').forEach(preset => {
        preset.classList.toggle('active', preset.dataset.theme === currentSettings.theme);
    });
    
    // Update range value displays
    updateRangeDisplays();
}

// Update range input value displays
function updateRangeDisplays() {
    const ranges = [
        { id: 'fontSize', suffix: 'px' },
        { id: 'lineHeight', suffix: '' },
        { id: 'letterSpacing', suffix: 'px' },
        { id: 'borderRadius', suffix: 'px' },
        { id: 'spacing', suffix: 'x' },
        { id: 'taskHeight', suffix: 'px' }
    ];
    
    ranges.forEach(({ id, suffix }) => {
        const input = document.getElementById(id);
        const display = input?.parentElement?.querySelector('.range-value');
        if (input && display) {
            display.textContent = input.value + suffix;
            input.addEventListener('input', () => {
                display.textContent = input.value + suffix;
            });
        }
    });
}

// Collect settings from form
function collectSettingsFromForm() {
    return {
        // Typography
        fontSize: parseInt(document.getElementById('fontSize').value),
        fontWeight: parseInt(document.getElementById('fontWeight').value),
        lineHeight: parseFloat(document.getElementById('lineHeight').value),
        letterSpacing: parseFloat(document.getElementById('letterSpacing').value),
        
        // Colors
        primaryColor: document.getElementById('primaryColor').value,
        accentColor: document.getElementById('accentColor').value,
        backgroundColor: document.getElementById('backgroundColor').value,
        textColor: document.getElementById('textColor').value,
        panelColor: document.getElementById('panelColor').value,
        
        // Layout
        borderRadius: parseInt(document.getElementById('borderRadius').value),
        spacing: parseFloat(document.getElementById('spacing').value),
        taskHeight: parseInt(document.getElementById('taskHeight').value),
        compactMode: document.getElementById('compactMode').checked,
        showNumbers: document.getElementById('showNumbers').checked,
        
        // Advanced
        customCSS: document.getElementById('customCSS').value,
        theme: currentSettings.theme
    };
}

// Apply settings to the page
function applySettings(settings = currentSettings) {
    const root = document.documentElement;
    
    // Apply CSS custom properties
    root.style.setProperty('--custom-font-size', settings.fontSize + 'px');
    root.style.setProperty('--custom-font-weight', settings.fontWeight);
    root.style.setProperty('--custom-line-height', settings.lineHeight);
    root.style.setProperty('--custom-letter-spacing', settings.letterSpacing + 'px');
    root.style.setProperty('--primary', settings.primaryColor);
    root.style.setProperty('--primary-600', adjustColorBrightness(settings.primaryColor, -20));
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--bg', settings.backgroundColor);
    root.style.setProperty('--panel', settings.panelColor);
    root.style.setProperty('--custom-border-radius', settings.borderRadius + 'px');
    root.style.setProperty('--custom-spacing-scale', settings.spacing);
    root.style.setProperty('--taskRowH', settings.taskHeight + 'px');
    
    // Apply body styles
    document.body.style.fontSize = settings.fontSize + 'px';
    document.body.style.fontWeight = settings.fontWeight;
    document.body.style.lineHeight = settings.lineHeight;
    document.body.style.letterSpacing = settings.letterSpacing + 'px';
    document.body.style.color = settings.textColor;
    document.body.style.background = `linear-gradient(180deg, ${settings.backgroundColor} 0%, ${adjustColorBrightness(settings.backgroundColor, 10)} 100%)`;
    
    // Apply utility classes
    document.body.classList.toggle('compact-mode', settings.compactMode);
    document.body.classList.toggle('hide-task-numbers', !settings.showNumbers);
    document.body.classList.toggle('no-animations', !settings.smoothAnimations);
    
    // Update animation controller settings
    if (animationController) {
        animationController.toggle(settings.smoothAnimations);
    }
    
    // Apply custom CSS
    applyCustomCSS(settings.customCSS);
    
    // Apply theme-specific adjustments
    applyTheme(settings.theme);
    
    // Update matrix sizing after applying settings to ensure proper fit
    setTimeout(() => updateMatrixSizing(), 100);
}

// Apply theme presets
function applyTheme(themeName) {
    const themes = {
        dark: {
            backgroundColor: '#0b1220',
            panelColor: '#0f172a',
            textColor: '#e2e8f0',
            primaryColor: '#2563eb',
            accentColor: '#10b981'
        },
        light: {
            backgroundColor: '#f8fafc',
            panelColor: '#ffffff',
            textColor: '#1e293b',
            primaryColor: '#3b82f6',
            accentColor: '#059669'
        },
        blue: {
            backgroundColor: '#0f1629',
            panelColor: '#1e293b',
            textColor: '#e2e8f0',
            primaryColor: '#0ea5e9',
            accentColor: '#06b6d4'
        },
        green: {
            backgroundColor: '#0f1b13',
            panelColor: '#1a2e20',
            textColor: '#e2e8f0',
            primaryColor: '#10b981',
            accentColor: '#22c55e'
        }
    };
    
    const theme = themes[themeName];
    if (theme) {
        Object.assign(currentSettings, theme);
        // Update color inputs to reflect theme
        if (settingsModal && !settingsModal.classList.contains('hidden')) {
            populateSettingsForm();
        }
    }
}

// Helper function to adjust color brightness
function adjustColorBrightness(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// Apply custom CSS
function applyCustomCSS(css) {
    let styleEl = document.getElementById('customStylesContainer');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'customStylesContainer';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
}

// Event listeners for settings
function initSettingsEventListeners() {
    if (!settingsBtn) return; // Guard against missing elements
    
    // Modal controls
    settingsBtn.addEventListener('click', showSettingsModal);
    closeSettingsBtn?.addEventListener('click', hideSettingsModal);
    cancelSettingsBtn?.addEventListener('click', hideSettingsModal);
    settingsBackdrop?.addEventListener('click', hideSettingsModal);
    
    // Save settings
    saveSettingsBtn?.addEventListener('click', () => {
        currentSettings = collectSettingsFromForm();
        applySettings(currentSettings);
        saveSettingsToStorage();
        hideSettingsModal();
    });
    
    // Color input synchronization
    const colorPairs = [
        ['primaryColor', 'primaryColorText'],
        ['accentColor', 'accentColorText'],
        ['backgroundColor', 'backgroundColorText'],
        ['textColor', 'textColorText'],
        ['panelColor', 'panelColorText']
    ];
    
    colorPairs.forEach(([colorId, textId]) => {
        const colorInput = document.getElementById(colorId);
        const textInput = document.getElementById(textId);
        
        if (colorInput && textInput) {
            colorInput.addEventListener('input', () => {
                textInput.value = colorInput.value;
            });
            
            textInput.addEventListener('input', () => {
                if (/^#[0-9A-F]{6}$/i.test(textInput.value)) {
                    colorInput.value = textInput.value;
                }
            });
        }
    });
    
    // Theme presets
    document.querySelectorAll('.theme-preset').forEach(preset => {
        preset.addEventListener('click', () => {
            document.querySelectorAll('.theme-preset').forEach(p => p.classList.remove('active'));
            preset.classList.add('active');
            currentSettings.theme = preset.dataset.theme;
            applyTheme(preset.dataset.theme);
        });
    });
    
    // Export/Import settings
    document.getElementById('exportSettings')?.addEventListener('click', exportSettings);
    document.getElementById('importSettings')?.addEventListener('click', () => {
        document.getElementById('importFile')?.click();
    });
    document.getElementById('importFile')?.addEventListener('change', importSettings);
    
    // Reset functions
    document.getElementById('resetSettings')?.addEventListener('click', () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            currentSettings = { ...settingsDefaults };
            populateSettingsForm();
            applySettings(currentSettings);
            saveSettingsToStorage();
        }
    });
    
    document.getElementById('resetTasks')?.addEventListener('click', async () => {
        if (confirm('Delete ALL your tasks? This cannot be undone.')) {
            try {
                const response = await fetch('/api/tasks/reset/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken'),
                    },
                });
                
                if (response.ok) {
                    // Clear local state and reload
                    state.tasks = [];
                    render();
                    hideSettingsModal();
                    alert('All tasks have been deleted successfully.');
                } else {
                    const errorData = await response.json();
                    alert('Error deleting tasks: ' + (errorData.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error resetting tasks:', error);
                alert('Error deleting tasks. Please try again.');
            }
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
            hideSettingsModal();
        }
    });
}

// Export settings to JSON file
function exportSettings() {
    const dataStr = JSON.stringify(currentSettings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eisenhower-todo-settings.json';
    link.click();
    URL.revokeObjectURL(url);
}

// Import settings from JSON file
function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            currentSettings = { ...settingsDefaults, ...imported };
            populateSettingsForm();
            applySettings(currentSettings);
            saveSettingsToStorage();
            alert('Settings imported successfully!');
        } catch (error) {
            alert('Error importing settings: Invalid file format');
        }
    };
    reader.readAsText(file);
}

// Override the original attemptDeleteTask to respect settings
function attemptDeleteTaskWithSettings(id){
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    const displayNum = taskIndex + 1;
    const title = task.title || `Task ${displayNum}`;
    const shouldConfirm = currentSettings.confirmDelete;
    const ok = shouldConfirm ? confirm(`Delete #${displayNum}: ${title}? This cannot be undone.`) : true;
    if (!ok) return;
    deleteTask(id);
}

// Initialize settings on page load
function initSettings() {
    loadSettingsFromStorage();
    applySettings(currentSettings);
    initSettingsTabs();
    initSettingsEventListeners();
    updateRangeDisplays();
}

// Initialize settings system
initSettings();

// ===== GSAP ANIMATIONS SYSTEM =====

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger, TextPlugin);

// Animation configuration
const animConfig = {
    duration: {
        fast: 0.3,
        normal: 0.6,
        slow: 1.2,
        pageLoad: 2
    },
    ease: {
        smooth: "power2.out",
        bounce: "back.out(1.7)",
        elastic: "elastic.out(1, 0.3)",
        snappy: "power3.inOut"
    }
};

// GSAP Animation Controller
class AnimationController {
    constructor() {
        this.isEnabled = true;
        this.timeline = gsap.timeline();
        this.init();
    }

    init() {
        this.setupPageLoadAnimation();
        this.setupScrollAnimations();
        this.setupHoverAnimations();
        this.setupTaskAnimations();
        this.setupMatrixAnimations();
        this.setupSettingsAnimations();
    }

    // Disable/Enable animations based on settings
    toggle(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            gsap.globalTimeline.clear();
        }
    }

    // Page load animation sequence
    setupPageLoadAnimation() {
        const tl = gsap.timeline();
        
        // Initially hide elements
        gsap.set([".header", ".matrix", ".tasks"], { opacity: 0, y: 50 });
        gsap.set(".task-item", { opacity: 0, x: -30, scale: 0.8 });
        gsap.set(".token", { scale: 0, rotation: 180 });
        gsap.set(".axis", { opacity: 0 });

        // Animate page load
        tl.to(".header", {
            duration: animConfig.duration.normal,
            opacity: 1,
            y: 0,
            ease: animConfig.ease.smooth
        })
        .to(".matrix", {
            duration: animConfig.duration.normal,
            opacity: 1,
            y: 0,
            ease: animConfig.ease.bounce,
            onComplete: () => this.animateMatrixReveal()
        }, "-=0.3")
        .to(".tasks", {
            duration: animConfig.duration.normal,
            opacity: 1,
            y: 0,
            ease: animConfig.ease.smooth
        }, "-=0.4")
        .to(".task-item", {
            duration: animConfig.duration.fast,
            opacity: 1,
            x: 0,
            scale: 1,
            stagger: 0.1,
            ease: animConfig.ease.smooth
        }, "-=0.2");
    }

    // Matrix reveal animation
    animateMatrixReveal() {
        const tl = gsap.timeline();
        
        // Animate axis labels
        tl.to(".axis", {
            duration: animConfig.duration.normal,
            opacity: 1,
            ease: animConfig.ease.smooth,
            stagger: 0.2
        })
        // Animate existing tokens
        .to(".token", {
            duration: animConfig.duration.normal,
            scale: 1,
            rotation: 0,
            ease: animConfig.ease.elastic,
            stagger: 0.1
        }, "-=0.4")
        // Animate matrix grid lines with a drawing effect
        .fromTo(".matrix-grid::before, .matrix-grid::after", {
            scaleX: 0,
            scaleY: 0
        }, {
            duration: animConfig.duration.slow,
            scaleX: 1,
            scaleY: 1,
            ease: animConfig.ease.smooth,
            stagger: 0.2
        }, "-=0.6");
    }

    // Task-related animations
    setupTaskAnimations() {
        // Task addition animation
        this.animateTaskAdd = (taskElement) => {
            if (!this.isEnabled) return;
            
            gsap.fromTo(taskElement, {
                opacity: 0,
                x: -50,
                scale: 0.8,
                rotationX: -90
            }, {
                duration: animConfig.duration.normal,
                opacity: 1,
                x: 0,
                scale: 1,
                rotationX: 0,
                ease: animConfig.ease.bounce
            });
        };

        // Task deletion animation
        this.animateTaskDelete = (taskElement, callback) => {
            if (!this.isEnabled) {
                callback?.();
                return;
            }

            gsap.to(taskElement, {
                duration: animConfig.duration.fast,
                opacity: 0,
                x: 100,
                scale: 0.8,
                rotationX: 90,
                ease: animConfig.ease.snappy,
                onComplete: callback
            });
        };

        // Task completion animation
        this.animateTaskComplete = (taskElement) => {
            if (!this.isEnabled) return;

            const tl = gsap.timeline();
            
            tl.to(taskElement, {
                duration: 0.2,
                scale: 1.1,
                ease: "power2.out"
            })
            .to(taskElement, {
                duration: 0.4,
                scale: 1,
                ease: animConfig.ease.bounce
            })
            .to(taskElement.querySelector('.task-title'), {
                duration: animConfig.duration.normal,
                opacity: 0.6,
                ease: animConfig.ease.smooth
            }, "-=0.4");

            // Strikethrough animation
            const title = taskElement.querySelector('.task-title');
            if (title) {
                gsap.to(title, {
                    duration: animConfig.duration.normal,
                    backgroundSize: "100% 2px",
                    ease: animConfig.ease.smooth
                });
            }
        };

        // Task reveal animation (when filtering)
        this.animateTaskReveal = (taskElement) => {
            if (!this.isEnabled) return;

            gsap.fromTo(taskElement, {
                opacity: 0,
                y: 20,
                scale: 0.95
            }, {
                duration: animConfig.duration.fast,
                opacity: 1,
                y: 0,
                scale: 1,
                ease: animConfig.ease.smooth
            });
        };
    }

    // Token/Matrix animations
    setupMatrixAnimations() {
        // Token drag start animation
        this.animateTokenDragStart = (tokenElement) => {
            if (!this.isEnabled) return;

            gsap.to(tokenElement, {
                duration: 0.2,
                scale: 1.2,
                zIndex: 1000,
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                ease: "power2.out"
            });
        };

        // Token drag end animation
        this.animateTokenDragEnd = (tokenElement) => {
            if (!this.isEnabled) return;

            gsap.to(tokenElement, {
                duration: animConfig.duration.fast,
                scale: 1,
                zIndex: 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                ease: animConfig.ease.bounce
            });
        };

        // Enhanced token drop animation with travel effect
        this.animateTokenDrop = (tokenElement, targetZone, callback) => {
            if (!this.isEnabled) {
                callback?.();
                return;
            }

            const tl = gsap.timeline();
            
            // Get current position and target position
            const startRect = tokenElement.getBoundingClientRect();
            const targetRect = targetZone.getBoundingClientRect();
            
            // Calculate the center of the target zone
            const targetX = targetRect.left + targetRect.width / 2;
            const targetY = targetRect.top + targetRect.height / 2;
            
            // Current position
            const startX = startRect.left + startRect.width / 2;
            const startY = startRect.top + startRect.height / 2;
            
            // Calculate travel distance
            const deltaX = targetX - startX;
            const deltaY = targetY - startY;
            
            // Create a clone for the animation
            const clone = tokenElement.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = startRect.left + 'px';
            clone.style.top = startRect.top + 'px';
            clone.style.width = startRect.width + 'px';
            clone.style.height = startRect.height + 'px';
            clone.style.zIndex = '10000';
            clone.style.pointerEvents = 'none';
            clone.classList.add('token-traveling');
            document.body.appendChild(clone);

            // Hide the original during animation
            gsap.set(tokenElement, { opacity: 0 });
            
            // Flash the target quadrant
            tl.to(targetZone, {
                duration: 0.1,
                backgroundColor: "rgba(37,99,235,0.2)",
                ease: "power2.out"
            })
            .to(targetZone, {
                duration: 0.3,
                backgroundColor: "transparent",
                ease: "power2.out"
            }, "-=0.1")
            
            // Animate the clone traveling to target
            .to(clone, {
                duration: 0.8,
                x: deltaX,
                y: deltaY,
                scale: 0.8,
                rotation: 360,
                ease: "power2.inOut",
                onComplete: () => {
                    // Remove clone and show original at destination
                    document.body.removeChild(clone);
                    gsap.set(tokenElement, { opacity: 1, scale: 0.8 });
                    
                    // Final settle animation
                    gsap.to(tokenElement, {
                        duration: 0.4,
                        scale: 1,
                        ease: animConfig.ease.bounce,
                        onComplete: callback
                    });
                }
            }, "-=0.3");
        };

        // Token return to list animation
        this.animateTokenReturn = (draggedToken, taskElement, callback) => {
            if (!this.isEnabled) {
                callback?.();
                return;
            }

            const tl = gsap.timeline();
            
            // Get positions
            const tokenRect = draggedToken.getBoundingClientRect();
            const taskRect = taskElement.getBoundingClientRect();
            
            // Calculate travel distance to task list
            const deltaX = taskRect.left - tokenRect.left;
            const deltaY = taskRect.top - tokenRect.top;
            
            // Create traveling clone
            const clone = draggedToken.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = tokenRect.left + 'px';
            clone.style.top = tokenRect.top + 'px';
            clone.style.width = tokenRect.width + 'px';
            clone.style.height = tokenRect.height + 'px';
            clone.style.zIndex = '10000';
            clone.style.pointerEvents = 'none';
            clone.classList.add('token-returning');
            document.body.appendChild(clone);

            // Hide original token
            gsap.set(draggedToken, { opacity: 0 });
            
            // Highlight the task row briefly
            tl.to(taskElement, {
                duration: 0.2,
                backgroundColor: "rgba(16,185,129,0.1)",
                ease: "power2.out"
            })
            .to(taskElement, {
                duration: 0.4,
                backgroundColor: "transparent",
                ease: "power2.out"
            }, "-=0.1")
            
            // Animate clone traveling back to task list
            .to(clone, {
                duration: 0.8,
                x: deltaX,
                y: deltaY,
                scale: 0.6,
                rotation: -180,
                ease: "power2.inOut",
                onComplete: () => {
                    // Remove clone and flash task row
                    document.body.removeChild(clone);
                    
                    // Flash effect on task row
                    gsap.fromTo(taskElement, {
                        scale: 1
                    }, {
                        duration: 0.3,
                        scale: 1.02,
                        ease: "power2.out",
                        yoyo: true,
                        repeat: 1,
                        onComplete: callback
                    });
                }
            }, "-=0.3");
        };

        // Matrix quadrant hover effects
        this.setupQuadrantHovers = () => {
            document.querySelectorAll('.quadrant').forEach(quadrant => {
                const onEnter = () => {
                    if (!this.isEnabled) return;
                    gsap.to(quadrant, {
                        duration: 0.3,
                        backgroundColor: "rgba(37,99,235,0.05)",
                        ease: "power2.out"
                    });
                };

                const onLeave = () => {
                    if (!this.isEnabled) return;
                    gsap.to(quadrant, {
                        duration: 0.3,
                        backgroundColor: "transparent",
                        ease: "power2.out"
                    });
                };

                quadrant.addEventListener('mouseenter', onEnter);
                quadrant.addEventListener('mouseleave', onLeave);
            });
        };
    }

    // Settings modal animations
    setupSettingsAnimations() {
        this.animateSettingsOpen = () => {
            if (!this.isEnabled) return;

            const modal = document.getElementById('settingsModal');
            const content = modal.querySelector('.settings-content');
            const backdrop = modal.querySelector('.settings-backdrop');

            gsap.set(modal, { display: 'flex' });
            
            const tl = gsap.timeline();
            
            tl.fromTo(backdrop, {
                opacity: 0
            }, {
                duration: animConfig.duration.fast,
                opacity: 1,
                ease: "power2.out"
            })
            .fromTo(content, {
                opacity: 0,
                scale: 0.8,
                y: -50
            }, {
                duration: animConfig.duration.normal,
                opacity: 1,
                scale: 1,
                y: 0,
                ease: animConfig.ease.bounce
            }, "-=0.2")
            .fromTo('.settings-tab', {
                x: -30,
                opacity: 0
            }, {
                duration: animConfig.duration.fast,
                x: 0,
                opacity: 1,
                stagger: 0.05,
                ease: animConfig.ease.smooth
            }, "-=0.3");
        };

        this.animateSettingsClose = (callback) => {
            if (!this.isEnabled) {
                callback?.();
                return;
            }

            const modal = document.getElementById('settingsModal');
            const content = modal.querySelector('.settings-content');
            const backdrop = modal.querySelector('.settings-backdrop');

            const tl = gsap.timeline();
            
            tl.to(content, {
                duration: animConfig.duration.fast,
                opacity: 0,
                scale: 0.8,
                y: -30,
                ease: "power2.in"
            })
            .to(backdrop, {
                duration: animConfig.duration.fast,
                opacity: 0,
                ease: "power2.out"
            }, "-=0.2")
            .call(() => {
                gsap.set(modal, { display: 'none' });
                callback?.();
            });
        };
    }

    // Hover animations for interactive elements
    setupHoverAnimations() {
        // Button hover effects
        const buttons = '.add-btn, .edit-btn, .delete-btn, .done-btn, .settings-btn, .primary-btn, .secondary-btn';
        
        gsap.utils.toArray(buttons).forEach(button => {
            const onEnter = () => {
                if (!this.isEnabled) return;
                gsap.to(button, {
                    duration: 0.2,
                    scale: 1.05,
                    ease: "power2.out"
                });
            };

            const onLeave = () => {
                if (!this.isEnabled) return;
                gsap.to(button, {
                    duration: 0.2,
                    scale: 1,
                    ease: "power2.out"
                });
            };

            button.addEventListener('mouseenter', onEnter);
            button.addEventListener('mouseleave', onLeave);
        });

        // Token hover effects
        document.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('token') && this.isEnabled) {
                gsap.to(e.target, {
                    duration: 0.2,
                    scale: 1.1,
                    ease: "power2.out"
                });
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('token') && this.isEnabled) {
                gsap.to(e.target, {
                    duration: 0.2,
                    scale: 1,
                    ease: "power2.out"
                });
            }
        });
    }

    // Scroll-triggered animations
    setupScrollAnimations() {
        // Animate elements as they come into view
        gsap.utils.toArray('.task-item').forEach(item => {
            gsap.fromTo(item, {
                opacity: 0,
                y: 30
            }, {
                opacity: 1,
                y: 0,
                duration: animConfig.duration.fast,
                ease: animConfig.ease.smooth,
                scrollTrigger: {
                    trigger: item,
                    start: "top 90%",
                    end: "bottom 10%",
                    toggleActions: "play none none reverse"
                }
            });
        });
    }

    // Tab switching animation
    animateTabSwitch(fromPanel, toPanel, fromTab, toTab) {
        if (!this.isEnabled) return;

        const tl = gsap.timeline();

        // Animate tab indicators
        tl.to(fromTab, {
            duration: 0.2,
            scale: 0.95,
            ease: "power2.out"
        })
        .to(toTab, {
            duration: 0.3,
            scale: 1.05,
            ease: animConfig.ease.bounce
        }, "-=0.1")
        .to(toTab, {
            duration: 0.2,
            scale: 1,
            ease: "power2.out"
        });

        // Animate panel content
        if (fromPanel) {
            gsap.to(fromPanel, {
                duration: 0.2,
                opacity: 0,
                x: -20,
                ease: "power2.out"
            });
        }

        if (toPanel) {
            gsap.fromTo(toPanel, {
                opacity: 0,
                x: 20
            }, {
                duration: 0.3,
                opacity: 1,
                x: 0,
                ease: animConfig.ease.smooth,
                delay: 0.1
            });
        }
    }

    // Notification/toast animation
    showNotification(message, type = 'info') {
        if (!this.isEnabled) return;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            padding: 12px 20px;
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            color: var(--text-color);
            z-index: 10000;
            opacity: 0;
            transform: translateX(-100%);
        `;

        document.body.appendChild(notification);

        const tl = gsap.timeline();
        
        tl.to(notification, {
            duration: 0.5,
            opacity: 1,
            x: 0,
            ease: animConfig.ease.bounce
        })
        .to(notification, {
            duration: 0.3,
            opacity: 0,
            x: -100,
            ease: "power2.in",
            delay: 3
        })
        .call(() => {
            document.body.removeChild(notification);
        });
    }
}

// Initialize animation controller
if (typeof gsap !== 'undefined') {
    animationController = new AnimationController();
    // Also keep window.animations for any legacy references
    window.animations = animationController;
}

// ===== HELP MODAL FUNCTIONALITY =====

// Help modal elements
const helpModal = document.getElementById('helpModal');
const helpBtn = document.getElementById('helpBtn');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const closeHelpFooterBtn = document.getElementById('closeHelpFooterBtn');
const helpBackdrop = document.querySelector('.help-backdrop');

// Show/hide help modal functions
function showHelpModal() {
    if (!helpModal) return;
    helpModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Use GSAP animation for opening
    if (animationController) {
        const content = helpModal.querySelector('.help-content');
        const backdrop = helpModal.querySelector('.help-backdrop');
        
        gsap.set(helpModal, { display: 'flex' });
        gsap.set(backdrop, { opacity: 0 });
        gsap.set(content, { opacity: 0, scale: 0.9, y: -30 });
        
        const tl = gsap.timeline();
        tl.to(backdrop, {
            duration: 0.3,
            opacity: 1,
            ease: "power2.out"
        })
        .to(content, {
            duration: 0.4,
            opacity: 1,
            scale: 1,
            y: 0,
            ease: "back.out(1.4)"
        }, "-=0.2");
    }
}

function hideHelpModal() {
    if (!helpModal) return;
    
    if (animationController) {
        const content = helpModal.querySelector('.help-content');
        const backdrop = helpModal.querySelector('.help-backdrop');
        
        const tl = gsap.timeline({
            onComplete: () => {
                helpModal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
        
        tl.to(content, {
            duration: 0.3,
            opacity: 0,
            scale: 0.9,
            y: -20,
            ease: "power2.in"
        })
        .to(backdrop, {
            duration: 0.2,
            opacity: 0,
            ease: "power2.in"
        }, "-=0.1");
    } else {
        helpModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Initialize help modal event listeners
function initHelpModal() {
    if (!helpBtn || !helpModal) return;
    
    // Open help modal
    helpBtn.addEventListener('click', showHelpModal);
    
    // Close help modal - multiple ways
    if (closeHelpBtn) {
        closeHelpBtn.addEventListener('click', hideHelpModal);
    }
    
    if (closeHelpFooterBtn) {
        closeHelpFooterBtn.addEventListener('click', hideHelpModal);
    }
    
    if (helpBackdrop) {
        helpBackdrop.addEventListener('click', hideHelpModal);
    }
    
    // Close on Escape key (update existing handler to include help modal)
    const existingEscapeHandler = document.querySelector('[data-help-escape]');
    if (!existingEscapeHandler) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (helpModal && !helpModal.classList.contains('hidden')) {
                    hideHelpModal();
                }
            }
        });
        // Mark that we've added this handler
        document.documentElement.setAttribute('data-help-escape', 'true');
    }
}

// Initialize help modal on page load
initHelpModal();

// Optional: Show help modal on first visit
function checkFirstVisit() {
    const hasVisited = localStorage.getItem('eisenhower-has-visited');
    if (!hasVisited) {
        // Show help after a brief delay on first visit
        setTimeout(() => {
            showHelpModal();
            localStorage.setItem('eisenhower-has-visited', 'true');
        }, 1000);
    }
}

// Uncomment the line below to enable first-visit help
// checkFirstVisit();
