import {Component, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {BackendService} from '../../_service/backend.service';
import {PreferencesService} from '../../_service/preferences.service';
import {ActivatedRoute, Router} from '@angular/router';
import {Endpoint} from "../../_model/endpoint";
import {ModalService} from '../../_service/modal.service';
import {EndpointList} from 'src/app/_model/endpoint';

@Component({
    selector: 'app-offsubnet-ept',
    templateUrl: './offsubnet-ept.component.html',
})

export class OffsubnetEptComponent implements OnInit {
    rows: any;
    pageSize: number;
    count = 0;
    pageNumber = 0;
    sorts = [{prop: 'events.0.ts', dir: 'desc'}];
    loading = true;
    endpoints: Endpoint[];
    @ViewChild('errorMsg') msgModal: TemplateRef<any>;

    constructor(public backendService: BackendService, private router: Router, private prefs: PreferencesService,
                private activatedRoute: ActivatedRoute, public modalService: ModalService) {
        this.pageSize = this.prefs.pageSize;
    }

    ngOnInit() {
        this.getOffsubnetEndpoints();
    }

    getOffsubnetEndpoints(pageOffset = this.pageNumber, sorts = this.sorts) {
        this.loading = true;
        this.activatedRoute.parent.paramMap.subscribe(params => {
            const fabricName = params.get('fabric');
            if (fabricName != null) {
                this.backendService.getFabricsOverviewTabData(fabricName, pageOffset, sorts, 'offsubnet').subscribe(
                    (data) => {
                        let endpoint_list = new EndpointList(data);
                        this.count = endpoint_list.count;
                        this.rows = endpoint_list.objects;
                        this.loading = false;
                    }, (error) => {
                        this.loading = false;
                        const msg = 'Could not fetch offsubnet endpoints! ' + error['error']['error'];
                        this.modalService.setAndOpenModal('error', 'Error', msg, this.msgModal);
                    }
                );
            }
        });
    }

    setPage(event) {
        this.pageNumber = event.offset;
        this.getOffsubnetEndpoints(event.offset, this.sorts);
    }

    onSort(event) {
        this.sorts = event.sorts;
        this.getOffsubnetEndpoints(this.pageNumber, event.sorts);
    }
}
