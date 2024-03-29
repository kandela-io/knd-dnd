import { Directive, Input, HostListener, inject, HostBinding, OnInit, OnDestroy } from '@angular/core';
import { KndDndService } from '../services/knd-dnd.service';
import { Subject, takeUntil } from 'rxjs';
import { defaultKndDndCssConfig } from '../knd-dnd-configuration';

@Directive({
  selector: '[kndSelectable]',
  standalone: true,
})
export class SelectableDirective<Item extends object> implements OnInit, OnDestroy {
  @Input() kndItem: Item;
  @HostBinding(`class.${defaultKndDndCssConfig.selectIsSelected}`) private _isSelected = false;
  @HostBinding(`class.${defaultKndDndCssConfig.selectIsShiftHovered}`) private _isShiftHovered = false;
  
  private dndService = inject(KndDndService<Item>);
  private destroy$ = new Subject<void>();

  @HostListener('mouseenter') private onMouseEnter(evt: MouseEvent) {
    this.dndService.hoverItem(this.kndItem);
  }

  @HostListener('mouseleave') private onMouseLeave(evt: MouseEvent) {
    this.dndService.resetHoverItem();
  }

  ngOnInit() {
    this.dndService.createItemStateObservable(this.kndItem).pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this._isSelected = state.isSelected;
      this._isShiftHovered = state.isShiftHovered;
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
  }

  selectItem() {
    this.dndService.selectItem(this.kndItem);
  }

  deSelectItem() {
    this.dndService.deSelectItem(this.kndItem);
  }

  get isSelected(): boolean {
    return this._isSelected
  }

  get isShiftHovered(): boolean {
    return this._isShiftHovered
  }
}