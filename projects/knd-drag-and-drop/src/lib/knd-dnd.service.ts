import { BehaviorSubject, Observable, ReplaySubject, Subject, combineLatest, filter, map, take } from 'rxjs';
import { Injectable, QueryList, Renderer2, RendererFactory2, inject } from '@angular/core';
import { KndDrawService } from './knd-draw.service';
import { KndIdentifier, KndItemState, KndMap, createEmptyKndMap, createEmptyMap, itemsInBetween } from './dnd/dnd.models';
import { SelectableDirective } from './dnd/selectable.directive';

@Injectable()
export class KndDndService<Item extends object> {

  private rendererFactory = inject(RendererFactory2);
  private renderer: Renderer2;
  private drawService =  inject(KndDrawService);

  private selectedItems = new BehaviorSubject(createEmptyMap<KndIdentifier, Item>());
  private shiftIsActive = new BehaviorSubject(false);
  private latestSelectedItem = new BehaviorSubject<Item | null>(null);
  private latestHoveredItem = new BehaviorSubject<Item | null>(null);

  private itemStates: Observable<KndMap<Item>>;
  public allAvailableSelectables = new ReplaySubject<QueryList<SelectableDirective<Item>>>(1);

  /**
   * Full map of items in dnd context. The key of the map is defined via function `selectUniqueIdentifier`.  
   * By default the property `id` is used as key
  */
  public selectedItems$ = this.selectedItems.asObservable();
  /**
   * Tracks if a dragging process is currently ongoing  
   * `true` if is dragging, `false` if not
  */
  public isDragging = new BehaviorSubject(false);

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);
    this.initTrackKeys();

    // control dragUI
    this.isDragging.subscribe(isDragging => {
      if (isDragging) this.drawService.showDragUI([...this.selectedItems.value.values()]);
      else this.drawService.hideDragUI();
    });

    this.initTrackItemStates();
  }

  private initTrackKeys() {
    this.renderer.listen(window, 'keydown', (evt: KeyboardEvent) => {
      if (evt.shiftKey) this.shiftIsActive.next(true);
      if ((evt.key === 'Escape' || evt.key === 'Esc')) this.deSelectAll();
    });

    this.renderer.listen(window, 'keyup', (evt: KeyboardEvent) => {
      if (!evt.shiftKey) this.shiftIsActive.next(false);
    });
  }
 
  /**
   * Select uniquie identifiably property of Item.  
   * By default the property `id` is used
  */
  protected selectUniqueIdentifier: ((item: Item) => KndIdentifier) = (item: Item) => {
    if (!Object.hasOwn(item, 'id')) {
      console.error(`
        KndDndService needs a unique identifier to work. 
        By default property "id", but could not be found in ${item}.
        Please override 'selectId' to select a different unique object property.
      `)
    }
    return (item as any).id as KndIdentifier
  }

  initTrackItemStates() {
    const allSelectables = this.allAvailableSelectables.pipe(
      map(selectables => selectables.toArray().map(s => s.kndItem)),
    )
    
    this.itemStates = combineLatest([allSelectables, this.selectedItems, this.shiftIsActive, this.latestHoveredItem, this.latestSelectedItem, this.isDragging]).pipe(
      map(([allSelectables, selectedItems, shiftIsActive, latestHoveredItem, latestSelectedItem, isDragging]) => {
        const map = createEmptyKndMap<Item>();

        // create entries for all existing selectables
        allSelectables.forEach(item => {
          const id = this.selectUniqueIdentifier(item);
          const state: KndItemState = { isDragging: false, isShiftHovered: false, isSelected: false }
          map.set(id, { item, state })
        })

        // update selected state for all entries
        selectedItems.forEach(selItem => {
          const id = this.selectUniqueIdentifier(selItem);
          const stateItem = map.get(id); // retrieves a ref
          stateItem!.state.isSelected = true;
        })

        // shift hover
        if (shiftIsActive && latestHoveredItem && latestSelectedItem) {
          const shouldShiftSelect = itemsInBetween(allSelectables, latestHoveredItem, latestSelectedItem);
          shouldShiftSelect.forEach(shouldShiftSelectItem => {
            const id = this.selectUniqueIdentifier(shouldShiftSelectItem);
            const stateItem = map.get(id); // retrieves a ref
            stateItem!.state.isShiftHovered = true;
          });
        }

        // check if item isDragging
        if (isDragging) {
          selectedItems.forEach(selectedItem => {
            const id = this.selectUniqueIdentifier(selectedItem);
            const stateItem = map.get(id);
            stateItem!.state.isDragging = true;
          })
        }

        return map;
      })
    )
  }

  /**
   * Select an item, adds it to the dnd service context
   * @param item item to be added to the dnd conext
  */
  public selectItem(item: Item) {
    if (this.selectedItems.value.has(this.selectUniqueIdentifier(item))) {
      console.info(`Item ${item} is already selected`)
      return
    }
    
    if (this.shiftIsActive.value && this.latestSelectedItem.value) this.shiftSelectItems();
    else this.selectItemSingle(item);

    this.latestSelectedItem.next(item);
  }

  private selectItemSingle(item: Item) {
    this.selectedItems.next(
      this.selectedItems.value.set(this.selectUniqueIdentifier(item), item)
    );
  }

  private shiftSelectItems() {
    this.itemStates.pipe(
      take(1),
      map(items => Array.from(items.values())),
      map(items => items.filter(item => item.state.isShiftHovered && !item.state.isSelected)),
      map(items => items.map(i => i.item)),
    ).subscribe(items => items.forEach(s => this.selectItemSingle(s)));
  }

  /**
   * Deselect an item, removes it from the dnd context
   * @param item item to be removed from the dnd context
  */
  public deSelectItem(item: Item) {
    const didDelete = this.selectedItems.value.delete(this.selectUniqueIdentifier(item));
    if (didDelete) {
      this.selectedItems.next(this.selectedItems.value);
      this.latestSelectedItem.next(null);
    }
    else {
      console.error(`Unable to deselect item as it was not selected ${item}.`)
    }
  }

  public hoverItem(item: Item) {
    if (this.latestHoveredItem.value != item) this.latestHoveredItem.next(item);
  }

  public resetHoverItem() {
    if (this.latestHoveredItem.value != null) this.latestHoveredItem.next(null);
  }

  /**
   * Deselect all item, Removes all items from the dnd context
  */
  public deSelectAll() {
    this.selectedItems.next(createEmptyMap<KndIdentifier, Item>());
    this.latestSelectedItem.next(null);
    console.log('All items have been deselected');
  }

  /**
   * Creates an obserable that tracks if the given item is currently part of the dnd context.
   * @return Observable that is `true` if item is dnd context, `false` if not
  */
  public createIsSelectedObservable(item: Item): Observable<boolean> {
    return this.selectedItems$.pipe(map(items => items.has(this.selectUniqueIdentifier(item))));
  }

  /**
   * Creates an observable for the state of an item in the current context
   * @return Observable of item state `KndItemState`
  */
  public createItemStateObservable(item: Item): Observable<KndItemState> {
    return this.itemStates.pipe(map(items => items.get(this.selectUniqueIdentifier(item))?.state as KndItemState));
  }
}