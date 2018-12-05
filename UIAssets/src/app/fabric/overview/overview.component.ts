import {Component, OnInit, ViewChild, TemplateRef} from '@angular/core';
import {BackendService} from '../../_service/backend.service';
import {PreferencesService} from '../../_service/preferences.service';
import {ActivatedRoute, Router} from '@angular/router';
import {Fabric, FabricList} from "../../_model/fabric";
import {forkJoin} from "rxjs";
import { ModalService } from '../../_service/modal.service';

@Component({
    selector: 'app-overview',
    templateUrl: './overview.component.html',
})

export class OverviewComponent implements OnInit {
    rows: any;
    pageSize: number;
    pageNumber = 0;
    sorts = [{prop: 'timestamp', dir: 'desc'}];
    loading = true;
    fabric: Fabric;
    @ViewChild('errorMsg') msgModal : TemplateRef<any> ;

    constructor(public backendService: BackendService, private router: Router, private prefs: PreferencesService, 
        private activatedRoute: ActivatedRoute, public modalService:ModalService) {
        this.pageSize = this.prefs.pageSize;
        this.rows = [];
    }

    ngOnInit() {
        this.getFabric();
    }

    getFabric() {
        this.loading = true;
        this.activatedRoute.paramMap.subscribe(params => {
            const fabricName = params.get('fabric');
            if (fabricName != null) {
                this.backendService.getFabricByName(fabricName).subscribe((results: FabricList) => {
                    this.fabric = results.objects[0].fabric;
                    this.rows = this.fabric.events;
                    const fabricStatusObservable = this.backendService.getFabricStatus(this.fabric);
                    const macObservable = this.backendService.getActiveMacAndIps(this.fabric, 'mac');
                    const ipv4Observable = this.backendService.getActiveMacAndIps(this.fabric, 'ipv4');
                    const ipv6Observable = this.backendService.getActiveMacAndIps(this.fabric, 'ipv6');
                    forkJoin([fabricStatusObservable, macObservable, ipv4Observable, ipv6Observable]).subscribe(results => {
                        this.fabric.status = results[0]['status'];
                        this.fabric.uptime = results[0]['uptime'] ;
                        this.fabric.mac = results[1]['count'];
                        this.fabric.ipv4 = results[2]['count'];
                        this.fabric.ipv6 = results[3]['count'];
                    });
                    this.loading = false;
                }, (err) => {
                    this.loading = false;
                    const msg = 'Failed to load fabrics! ' + err['error']['error'] ;
                    this.modalService.setAndOpenModal('error','Error',msg,this.msgModal) ;
                });
            }
        });
    }
}
